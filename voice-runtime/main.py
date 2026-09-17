"""Sigulon voice runtime: Pipecat + Cartesia STT + OpenRouter LLM + Cartesia TTS + Plivo.

One deployment serves all tenants. Per call, Plivo opens a WebSocket here
after answering; this service runs a dedicated Pipecat pipeline for the
call's agent config, then finalizes idempotently (concurrency slot + calls
row + call_events audit) on every exit path — normal hangup, error,
timeout, or process shutdown.

Providers are swappable per tenant via AgentConfig (providers/):
Cartesia STT, OpenRouter Gemini 2.5 Flash LLM, Cartesia TTS,
Plivo telephony (answer XML + REST hangup/dial).

Ops: GET /healthz (liveness), GET /readyz (dep checks), GET /metrics
(Prometheus), bearer-gated POST /internal/finalize-call.

One deployment serves all tenants. Per call, Plivo opens a WebSocket here
after answering; this service runs a dedicated Pipecat pipeline for the
call's agent config, then cleans up (concurrency slot + call log) on every
exit path — normal hangup, error, timeout, or process shutdown.

WebSocket URL format (set as the ``<Stream>`` URL in the Plivo answer XML,
which the Next.js control plane generates)::

    wss://<voice-runtime-host>/voice-runtime/{call_id}

with a bidirectional 8kHz mulaw stream::

    <Response>
      <Stream bidirectional="true" keepCallAlive="true"
              contentType="audio/x-mulaw;rate=8000"
              statusCallbackUrl="https://<host>/plivo/status-callback">
        wss://<voice-runtime-host>/voice-runtime/{call_id}
      </Stream>
    </Response>

Deploy note: this service holds long-lived WebSocket connections — run it on
Fly.io / Cloud Run (min-instances >= 1, request timeout raised / streaming
enabled), not on scale-to-zero serverless.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Any, Optional
from urllib.parse import parse_qsl

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

from auth import require_internal_secret, verify_runtime_stream_token
from billing import notify_credits_reserve
from config import (
    AgentConfig,
    ConcurrencyStateUnavailable,
    ConfigNotFoundError,
    acquire_concurrency_slot,
    close_mongodb,
    close_redis,
    get_redis,
    load_agent_config,
)
from observability import (
    JsonFormatter,
    bind_call_context,
    check_readiness,
    clear_call_context,
    inc,
    render_prometheus,
    set_gauge,
)
from pipeline import CallSetupError, build_call_pipeline
from latency import VoiceLatencyTracker
from session import (
    VoiceSession,
    create_session,
    finalize_call,
    get_session,
    heartbeat,
    register_local_call,
)

# ---------------------------------------------------------------------------
# Structured logging (one JSON object per line, enriched with call context)
# ---------------------------------------------------------------------------


_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
log = logging.getLogger("voice-runtime")

# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201, ARG001
    missing = [
        name
        for name in ("CARTESIA_API_KEY", "REDIS_URL", "MONGODB_URI")
        if not os.getenv(name)
    ]
    if not os.getenv("OPENROUTER_API_KEY"):
        missing.append("OPENROUTER_API_KEY")
    if missing:
        log.warning("Missing env vars (calls will fail until set): %s", missing)
    else:
        log.info("Voice runtime starting; required env present")
    if not os.getenv("INTERNAL_API_SECRET"):
        log.warning("INTERNAL_API_SECRET not set: /internal/* routes are disabled (fail-closed)")
    try:
        pong = await get_redis().ping()
        log.info("[redis] ping successful=%s", bool(pong))
    except Exception as exc:  # noqa: BLE001 - /healthz still serves
        log.warning("[redis] connection failed: %s", exc)
    try:
        from config import ping_mongodb

        log.info("[startup] mongodb=%s", "ok" if await ping_mongodb() else "failed")
    except Exception as exc:  # noqa: BLE001 - liveness must stay available
        log.warning("[startup] mongodb=failed error=%s", exc)
    yield
    await close_redis()
    close_mongodb()
    log.info("Voice runtime shut down")


app = FastAPI(title="Sigulon Voice Runtime", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "voice-runtime"}


@app.get("/readyz")
async def readyz() -> JSONResponse:
    """Dependency checks (Redis, MongoDB config, provider keys) + metrics."""
    report = await check_readiness()
    code = 200 if report["status"] == "ok" else 503
    return JSONResponse(report, status_code=code)


@app.get("/metrics")
async def metrics() -> PlainTextResponse:
    """Prometheus exposition (per-pod counters; aggregation is Phase 9)."""
    return PlainTextResponse(render_prometheus(), media_type="text/plain; version=0.0.4")


class FinalizeRequest(BaseModel):
    call_id: str
    outcome: str = "completed"
    duration_seconds: int = 0
    tenant_id: Optional[str] = None
    agent_id: Optional[str] = None


@app.post("/internal/finalize-call")
async def internal_finalize_call(
    body: FinalizeRequest,
    _authed: None = Depends(require_internal_secret),
) -> JSONResponse:
    """Idempotent finalize for the control plane / worker (bearer-gated)."""
    done = await finalize_call(
        call_id=body.call_id,
        outcome=body.outcome,
        duration_seconds=body.duration_seconds,
        tenant_id=body.tenant_id,
        agent_id=body.agent_id,
    )
    return JSONResponse({"ok": True, "finalized": done})


@app.get("/internal/session/{call_id}")
async def internal_get_session(
    call_id: str,
    _authed: None = Depends(require_internal_secret),
) -> JSONResponse:
    """Live session inspection for the control plane / worker (bearer-gated)."""
    session = await get_session(call_id)
    if session is None:
        return JSONResponse({"ok": False, "error": "no live session"}, status_code=404)
    return JSONResponse({"ok": True, "session": session.model_dump()})


@app.post("/plivo/status-callback")
async def plivo_status_callback(request: Request) -> JSONResponse:
    """Receives Plivo stream status callbacks (started/stopped/failed).

    The WebSocket close is the authoritative end-of-call signal (handled in
    the WS endpoint's cleanup path); this is an audit-trail complement.
    """
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            payload = await request.json()
        except ValueError:
            payload = {}
    else:
        # Plivo status webhooks are application/x-www-form-urlencoded. Parse
        # them without adding python-multipart to the runtime's hot path.
        payload = dict(parse_qsl((await request.body()).decode("utf-8", errors="replace")))

    log.info(
        "Plivo status callback: event=%s call=%s stream=%s reason=%s duration=%s",
        payload.get("Event"), payload.get("CallUUID"), payload.get("StreamID"),
        payload.get("StatusReason"), payload.get("Duration"),
    )
    return JSONResponse({"ok": True})


# ---------------------------------------------------------------------------
# Call logging stub (MongoDB persistence)
# ---------------------------------------------------------------------------


async def log_call_outcome(
    *,
    config: Optional[AgentConfig],
    call_id: str,
    outcome: str,
    duration_seconds: int,
    transcript: Optional[list[dict[str, str]]] = None,
    summary: Optional[str] = None,
    disposition: Optional[str] = None,
    recording_data: Optional[dict[str, Any]] = None,
) -> None:
    """Record call duration/outcome via the idempotent :func:`finalize_call`.

    Kept under this name for back-compat; the durability lives in
    ``session.finalize_call`` (concurrency-slot release + ``calls`` update +
    ``call_events`` audit row, safe to invoke twice).
    """
    try:
        await finalize_call(
            call_id=call_id,
            outcome=outcome,
            duration_seconds=duration_seconds,
            tenant_id=config.tenant_id if config else None,
            agent_id=config.agent_id if config else None,
            transcript=transcript,
            summary=summary,
            disposition=disposition,
            recording_data=recording_data,
        )
    except Exception as exc:  # noqa: BLE001 - logging must not raise
        log.warning("log_call_outcome failed for call %s: %s", call_id, exc)
    log.info(
        "Call ended: call_id=%s tenant=%s agent=%s outcome=%s duration_s=%d",
        call_id,
        config.tenant_id if config else None,
        config.agent_id if config else None,
        outcome,
        duration_seconds,
    )


# ---------------------------------------------------------------------------
# WebSocket entry point (one per Plivo call)
# ---------------------------------------------------------------------------


@app.websocket("/voice-runtime/{call_id}")
async def voice_websocket(
    websocket: WebSocket,
    call_id: str,
    token: Optional[str] = Query(default=None),
) -> None:
    if not verify_runtime_stream_token(call_id, token):
        log.warning("Rejecting unauthenticated media socket for call %s", call_id)
        await websocket.close(code=1008, reason="invalid media stream token")
        return
    websocket_started = time.perf_counter()
    await websocket.accept()
    log.info(
        "[voice-latency] callId=%s stage=websocket_connected durationMs=%d",
        call_id,
        round((time.perf_counter() - websocket_started) * 1000),
    )
    started = time.monotonic()
    bind_call_context(call_id=call_id)
    config: Optional[AgentConfig] = None
    slot_held = False
    outcome = "completed"
    hb_task: Optional[asyncio.Task] = None
    credit_task: Optional[asyncio.Task[bool]] = None
    call: Optional[Any] = None  # CallPipeline once built; None on early reject
    latency = VoiceLatencyTracker(call_id)

    async def _heartbeat_loop(target_call_id: str) -> None:
        try:
            while True:
                await asyncio.sleep(30)
                if await heartbeat(target_call_id) is None:
                    return
        except asyncio.CancelledError:
            pass

    try:
        # -- 1. Load per-call agent config (Redis -> MongoDB) -------------
        try:
            config_started = time.perf_counter()
            config = await load_agent_config(call_id)
            log.info(
                "[voice-latency] callId=%s stage=agent_config_lookup durationMs=%d",
                call_id, round((time.perf_counter() - config_started) * 1000),
            )
            log.info("[voice] agent config loaded call_id=%s", call_id)
        except ConfigNotFoundError as exc:
            outcome = f"setup_failed: {exc}"
            inc("calls_setup_failed_total")
            log.error("Rejecting call %s: %s", call_id, exc)
            await websocket.close(code=1011, reason="unknown call")
            return

        bind_call_context(
            call_id=call_id, tenant_id=config.tenant_id, agent_id=config.agent_id
        )

        # -- 2. Per-tenant concurrency gate --------------------------------
        try:
            admitted, count = await acquire_concurrency_slot(
                config.tenant_id, config.max_concurrent_calls
            )
        except ConcurrencyStateUnavailable as exc:
            outcome = "rejected_concurrency_state_unavailable"
            inc("calls_rejected_concurrency_state_total")
            log.error("Rejecting call %s: %s", call_id, exc)
            await websocket.close(code=1013, reason="concurrency state unavailable")
            return
        if not admitted:
            outcome = "rejected_concurrency"
            inc("calls_rejected_concurrency_total")
            log.warning(
                "Rejecting call %s: tenant %s at limit (%d/%d)",
                call_id, config.tenant_id, count, config.max_concurrent_calls,
            )
            await websocket.close(code=1013, reason="tenant concurrency limit")
            return
        slot_held = True
        inc("calls_started_total")
        inc("active_calls")

        # -- 2b. Session tracking (memory + Redis; MongoDB follows in finalize)
        session_started = time.perf_counter()
        session = await create_session(
            VoiceSession(
                session_id=call_id,
                call_id=call_id,
                org_id=config.tenant_id,
                agent_id=config.agent_id,
                direction=config.direction,
                stt_provider=config.stt_provider,
                llm_provider=config.llm_provider,
                tts_provider=config.tts_provider,
            )
        )
        await heartbeat(call_id, status="active")
        log.info(
            "[voice-latency] callId=%s stage=session_lookup durationMs=%d",
            call_id,
            round((time.perf_counter() - session_started) * 1000),
        )
        hb_task = asyncio.create_task(_heartbeat_loop(call_id))

        # -- 2c. Billing hold (idempotent; outbound-answer also reserves) ----
        # Best-effort: audio never waits on billing, and settle reconciles.
        # Reservation is already idempotent per call and settlement reconciles
        # a missed best-effort ping. Do it concurrently so a control-plane
        # timeout can never delay the caller's first greeting/audio frame.
        credit_started = time.perf_counter()
        credit_task = asyncio.create_task(
            notify_credits_reserve(call_id, timeout_seconds=1.0)
        )

        def _credit_reservation_done(task: asyncio.Task[bool]) -> None:
            try:
                reserved = task.result()
                log.info(
                    "[voice-latency] callId=%s stage=credit_reservation durationMs=%d reserved=%s",
                    call_id,
                    round((time.perf_counter() - credit_started) * 1000),
                    reserved,
                )
            except asyncio.CancelledError:
                log.warning("Credit reservation cancelled for call %s", call_id)
            except Exception as exc:  # noqa: BLE001 - notify is defensive itself
                log.warning("Credit reservation task failed for call %s: %s", call_id, exc)

        credit_task.add_done_callback(_credit_reservation_done)

        # -- 3. Build the pipeline ------------------------------------------
        try:
            pipeline_started = time.perf_counter()
            call = await build_call_pipeline(websocket, config, latency=latency)
            register_local_call(
                session,
                agent_config=config,
                pipeline=call.pipeline,
                conversation_context=call.context,
            )
            log.info(
                "[voice-latency] callId=%s stage=pipeline_start durationMs=%d",
                call_id, round((time.perf_counter() - pipeline_started) * 1000),
            )
        except CallSetupError as exc:
            outcome = f"setup_failed: {exc}"
            inc("calls_setup_failed_total")
            log.error("Call %s setup failed: %s", call_id, exc)
            await websocket.close(code=1011, reason="pipeline setup failed")
            return

        @call.transport.event_handler("on_client_connected")
        async def _on_connect(transport: Any, *args: Any, **kwargs: Any) -> None:
            log.info("[voice] plivo websocket connected call_id=%s", call_id)

        @call.transport.event_handler("on_client_disconnected")
        async def _on_disconnect(transport: Any, *args: Any, **kwargs: Any) -> None:
            log.info("[voice] client disconnected call_id=%s", call_id)
            if call and getattr(call, "worker", None):
                try:
                    await call.worker.cancel()
                except Exception as exc:
                    log.warning("Pipeline worker cancellation on disconnect failed (call=%s): %s", call_id, exc)
            log.info("[voice] pipeline cleanup complete call_id=%s", call_id)

        @call.worker.event_handler("on_worker_failed")
        async def _on_failed(worker: Any, error: Any) -> None:  # noqa: ANN001, ANN202
            # Visibility so a mid-call service failure never hangs silently.
            nonlocal outcome
            outcome = "error: pipeline worker failed"
            log.error("Pipeline worker failed (call=%s): %s", call_id, error)
            try:
                await worker.cancel()
            except Exception as exc:  # noqa: BLE001 - normal cleanup still follows
                log.warning("Pipeline worker cancellation failed (call=%s): %s", call_id, exc)

        # -- 4. Greet (outbound with empty intro waits for the callee) ------
        if call.introduction:
            from pipecat.frames.frames import TTSSpeakFrame

            await call.worker.queue_frame(TTSSpeakFrame(call.introduction))

        # -- 5. Run until hangup / error / hard duration cap -----------------
        try:
            await asyncio.wait_for(call.runner.run(), timeout=config.max_call_seconds)
        except asyncio.TimeoutError:
            outcome = "timeout"
            log.warning("Call %s hit max duration (%ds); ending", call_id, config.max_call_seconds)
            try:
                await call.worker.cancel()
            except Exception as exc:  # noqa: BLE001 - teardown best-effort
                log.warning("Worker cancel after timeout failed: %s", exc)

    except WebSocketDisconnect:
        log.info("WebSocketDisconnect (call=%s)", call_id)
    except Exception as exc:  # noqa: BLE001 - never leave a dead socket open
        outcome = f"error: {exc}"
        log.exception("Unhandled error on call %s", call_id)
        try:
            await websocket.close(code=1011, reason="internal error")
        except Exception:  # noqa: BLE001, S110 - socket may already be gone
            pass
    finally:
        duration = int(time.monotonic() - started)
        if credit_task is not None and not credit_task.done():
            try:
                await asyncio.wait_for(asyncio.shield(credit_task), timeout=1.1)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                credit_task.cancel()
            except Exception:  # noqa: BLE001 - callback logs the safe detail
                pass
        if hb_task is not None:
            hb_task.cancel()
            try:
                await hb_task
            except asyncio.CancelledError:
                pass
            except Exception:  # noqa: BLE001 - heartbeat teardown is best-effort
                pass
        if slot_held:
            inc("active_calls", -1.0)
            if outcome in ("completed", "timeout"):
                inc("calls_completed_total")
        # Cleanup hook: idempotent finalize on every path (hangup, reject,
        # error, timeout). Safe to run twice — the finalized marker dedupes.
        # Transcript + summary ride along when a pipeline actually ran.
        transcript: Optional[list[dict[str, str]]] = None
        summary: Optional[str] = None
        disposition: Optional[str] = None
        recording_data: Optional[dict[str, Any]] = None
        try:
            if call is not None and getattr(call, "recorder", None) is not None:
                wav_bytes, rec_duration = call.recorder.finalize_recording()
                if wav_bytes and config is not None:
                    from recording import upload_call_recording

                    recording_data = await upload_call_recording(
                        org_id=config.tenant_id,
                        agent_id=config.agent_id,
                        call_id=call_id,
                        wav_bytes=wav_bytes,
                        duration_seconds=rec_duration,
                    )
        except Exception as exc:  # noqa: BLE001 - recording failure never breaks cleanup
            log.warning("recording finalization/upload failed for call %s: %s", call_id, exc)
        try:
            if call is not None and getattr(call, "context", None) is not None:
                from postcall import summarize_call, transcript_from_context

                transcript = transcript_from_context(call.context) or None
                if transcript and config is not None:
                    from pipeline import resolve_api_keys

                    recap = await summarize_call(
                        transcript,
                        api_key=resolve_api_keys(config).get("openrouter", ""),
                        model=config.llm_model,
                    )
                    if recap:
                        summary = recap.get("summary") or None
                        disposition = recap.get("outcome") or None
        except Exception as exc:  # noqa: BLE001 - extraction never breaks cleanup
            log.warning("post-call extraction failed for call %s: %s", call_id, exc)
        try:
            await log_call_outcome(
                config=config, call_id=call_id,
                outcome=outcome, duration_seconds=duration,
                transcript=transcript, summary=summary, disposition=disposition,
                recording_data=recording_data,
            )
        except Exception as exc:  # noqa: BLE001 - logging must not raise
            log.warning("log_call_outcome failed for call %s: %s", call_id, exc)
        finally:
            clear_call_context()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        # Long-lived telephony sockets: no short proxy timeouts in front.
        timeout_keep_alive=75,
    )
