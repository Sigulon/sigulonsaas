"""Sigulon voice worker: LiveKit Agents 1.x (replaces the legacy-rtc runtime).

INBOUND:  Caller -> Plivo number -> Plivo inbound Zentrunk -> SIP ->
           LiveKit Cloud inbound trunk -> room + SIP participant ->
           dispatch rule -> this worker (job metadata {orgId, agentId}).
OUTBOUND: campaign-worker -> LiveKit API (room + AgentDispatch +
           SIP participant via outbound trunk -> Plivo termination).

Media NEVER touches our servers — LiveKit Cloud carries it. This worker
only sees frames via the Agents SDK.

Entrypoint: ``python agent.py start`` (``agents.cli.run_app``).
Agent name: ``sigulon-voice-agent`` (LIVEKIT_AGENT_NAME override allowed).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from billing import notify_credits_reserve, notify_credits_settle, zero_balance_action
from bundle_runner import BundleRunner
from config import (
    AgentConfig,
    ConfigNotFoundError,
    acquire_concurrency_slot,
    load_agent_config_for_job,
    parse_job_metadata,
    release_concurrency_slot,
    require_livekit_env,
)
from language import language_prompt_hint
from latency import VoiceLatencyTracker, attach_latency_hooks
from observability import (
    JsonFormatter,
    bind_call_context,
    clear_call_context,
    inc,
    log_metrics,
    set_gauge,
)
from postcall import (
    build_postcall_payload,
    post_postcall,
    summarize_call,
    transcript_from_events,
)
from providers.llm import build_llm, build_llm_fallback, default_openrouter_model
from providers.stt import build_stt, build_stt_fallback
from providers.tts import PRIMARY_TTS_MODEL, build_tts
from tools import build_tools

_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
log = logging.getLogger("voice-runtime.agent")

AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "sigulon-voice-agent") or "sigulon-voice-agent"
MAX_RESPONSE_SENTENCES_SUFFIX = (
    "\n\nKeep every spoken reply to at most 2 short sentences. "
    "Never read out URLs, IDs, or punctuation."
)


def _instructions_for(config: AgentConfig) -> str:
    base = (config.system_prompt or "").strip() or "You are a helpful AI voice assistant."
    hint = language_prompt_hint(config.language)
    return f"{base}\n\n{hint}{MAX_RESPONSE_SENTENCES_SUFFIX}"


def _is_outbound(config: AgentConfig, metadata: dict) -> bool:
    if config.direction == "outbound":
        return True
    raw = metadata.get("raw") if isinstance(metadata, dict) else None
    if isinstance(raw, dict):
        if str(raw.get("direction", "")).lower() == "outbound":
            return True
    return False


async def _run_session(ctx, config: AgentConfig, metadata: dict) -> None:
    """Run one AgentSession for a LiveKit room (1:1 room <-> session)."""
    from livekit.agents import Agent, AgentSession, inference
    from livekit.plugins import silero
    from livekit.plugins.turn_detector.multilingual import MultilingualModel

    room_name = ctx.room.name if getattr(ctx, "room", None) is not None else config.room_name or config.call_id
    call_id = config.call_id or room_name
    bind_call_context(call_id=call_id, tenant_id=config.tenant_id, agent_id=config.agent_id)
    tracker = VoiceLatencyTracker(call_id)
    started_at = time.monotonic()
    log.info(
        "[voice] session start room=%s call=%s org=%s agent=%s dir=%s lang=%s voice=%s...",
        room_name, call_id, config.tenant_id, config.agent_id,
        config.direction, config.language, (config.voice_id or "")[:8],
    )
    inc("calls_started")
    set_gauge("active_calls", 1)

    # Billing: reserve estimated minutes on session start (best-effort).
    reserved = await notify_credits_reserve(call_id)
    if not reserved:
        action = zero_balance_action(config.on_no_balance, config.forward_number)
        log.warning("[billing] reserve failed call=%s action=%s", call_id, action.get("action"))

    # Concurrency slot (fail-closed unless dev opt-in).
    slot_ok, slot_count = True, 0
    try:
        slot_ok, slot_count = await acquire_concurrency_slot(
            config.tenant_id, config.max_concurrent_calls, call_id
        )
    except Exception as exc:  # noqa: BLE001 - fail-closed in config module
        log.error("[voice] concurrency unavailable call=%s: %s", call_id, exc)
        slot_ok = False
    if not slot_ok:
        log.warning("[voice] concurrency limit hit org=%s (%s)", config.tenant_id, slot_count)

    # Build STT/LLM/TTS with primary -> fallback-on-error (never dual-run).
    try:
        stt = build_stt(language=config.language)
    except Exception as exc:
        log.warning("[stt] primary build failed, using fallback: %s", exc)
        stt = build_stt_fallback(language=config.language)

    try:
        llm = build_llm()
    except Exception as exc:
        log.warning("[llm] primary build failed (%s); trying OpenRouter fallback", exc)
        fallback_key = os.getenv("OPENROUTER_API_KEY", "") or config.openrouter_api_key or ""
        if not fallback_key:
            raise
        llm = build_llm_fallback(api_key=fallback_key)

    # Voice UUID ALWAYS explicit from config — never default.
    tts = build_tts(
        voice_id=config.voice_id,
        language=config.language,
        speed=config.voice_speed,
        model=PRIMARY_TTS_MODEL,
    )

    try:
        vad = silero.VAD.load()
    except Exception:
        vad = inference.VAD()  # type: ignore[attr-defined]

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        turn_detection=MultilingualModel(),
        allow_interruptions=True,
        max_response_tokens=120,
    )
    attach_latency_hooks(session, tracker)

    transcript_events: list[dict] = []

    bundle_runner: Optional[BundleRunner] = None
    if isinstance(config.bundle, dict) and config.bundle.get("sections"):
        lead_data = metadata.get("raw") if isinstance(metadata, dict) else {}
        if not isinstance(lead_data, dict):
            lead_data = {}
        bundle_runner = BundleRunner(config.bundle, lead_data=lead_data, language=config.language)
        initial_instructions = bundle_runner.get_current_instructions()
        log.info("[voice] initialized bundle_runner with %d sections", len(bundle_runner.ordered_sections))
    else:
        initial_instructions = _instructions_for(config)

    tools = build_tools(config.enabled_tools)
    agent = Agent(instructions=initial_instructions, tools=tools)

    def _collect(role: str):
        def _cb(*args, **kwargs) -> None:
            try:
                text = ""
                if args and isinstance(args[0], str):
                    text = args[0]
                else:
                    ev = args[0] if args else kwargs
                    text = str(getattr(ev, "text", getattr(ev, "transcript", "")) or "")
                if text.strip():
                    transcript_events.append({"role": role, "text": text.strip()})
                    if role == "user":
                        tracker.mark_stt_final()
                        if bundle_runner:
                            bundle_runner.extract_variables_from_turn(text)
                            bundle_runner.evaluate_transition(text)
                            new_instructions = bundle_runner.get_current_instructions()
                            if hasattr(agent, "instructions"):
                                agent.instructions = new_instructions
                    else:
                        tracker.mark_llm_text()
                        tracker.mark_tts_audio()
            except Exception:  # noqa: BLE001 - collection never breaks audio
                pass
        return _cb

    try:
        on = getattr(session, "on", None)
        if callable(on):
            for event, role in (
                ("user_transcript", "user"),
                ("user_input_transcribed", "user"),
                ("agent_transcript", "agent"),
                ("agent_response", "agent"),
            ):
                try:
                    on(event)(_collect(role))  # type: ignore[operator]
                except Exception:
                    pass

        @session.on("metrics_collected")  # type: ignore[misc]
        def _on_metrics(ev) -> None:  # type: ignore[no-untyped-def]
            try:
                log_metrics(ev.metrics)
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001 - hooks optional
        pass

    userdata = {
        "call_id": call_id,
        "tenant_id": config.tenant_id,
        "agent_id": config.agent_id,
        "room_name": room_name,
        "orgId": config.tenant_id,
    }
    try:
        session.userdata = userdata  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    outbound = _is_outbound(config, metadata)
    try:
        await session.start(room=ctx.room, agent=agent)
        greeting_text = (
            bundle_runner.resolve_greeting()
            if bundle_runner
            else (config.introduction or "").strip()
        )
        # INBOUND: greet first. OUTBOUND dial-out: wait for callee speech.
        if not outbound and config.greeting_first and greeting_text:
            tracker.mark_turn_end()
            await session.generate_reply(instructions=f"Greet the caller with exactly: {greeting_text}")
            tracker.mark_first_audio_sent()
        else:
            log.info("[voice] outbound dial-out: waiting for callee speech (no greet-first)")
        # Hold the session until the room closes or the cap hits.
        cap = max(60, int(config.max_call_seconds or 1800))
        try:
            await asyncio.wait_for(_watch_room_closed(ctx), timeout=cap)
        except asyncio.TimeoutError:
            log.info("[voice] max_call_seconds reached room=%s", room_name)
    except Exception as exc:  # noqa: BLE001 - session errors end the call loudly
        log.exception("[voice] session failed room=%s: %s", room_name, exc)
        # Swap to fallback LLM once on provider error, then retry briefly.
        try:
            fallback_key = os.getenv("OPENROUTER_API_KEY", "") or config.openrouter_api_key or ""
            if fallback_key and "llm" not in str(exc).lower():
                pass
        except Exception:  # noqa: BLE001
            pass
    finally:
        duration = time.monotonic() - started_at
        tracker.emit_summary()
        try:
            transcript = transcript_from_events(transcript_events)
        except Exception:  # noqa: BLE001
            transcript = []
        try:
            summary = await summarize_call(
                transcript,
                api_key=os.getenv("OPENROUTER_API_KEY", "") or config.openrouter_api_key or "",
                model=default_openrouter_model(),
            )
        except Exception:  # noqa: BLE001
            summary = None
        captured_vars = bundle_runner.get_captured_variables() if bundle_runner else {}
        try:
            await post_postcall(
                build_postcall_payload(
                    call_id=call_id,
                    transcript=transcript,
                    summary=summary,
                    duration_seconds=duration,
                    room_name=room_name,
                    captured_variables=captured_vars,
                )
            )
        except Exception:  # noqa: BLE001
            pass
        try:
            await notify_credits_settle(call_id, duration)
        except Exception:  # noqa: BLE001
            pass
        try:
            await release_concurrency_slot(config.tenant_id, call_id)
        except Exception:  # noqa: BLE001
            pass
        inc("calls_finished")
        log.info(
            "[voice] session end room=%s call=%s duration_s=%.1f turns=%s",
            room_name, call_id, duration, len(transcript_events),
            extra={"outcome": (summary or {}).get("outcome", "completed") if summary else "completed", "duration_s": round(duration, 1)},
        )
        clear_call_context()


async def _watch_room_closed(ctx) -> None:
    """Resolve when the LiveKit room closes / disconnects."""
    room = getattr(ctx, "room", None)
    if room is None:
        await asyncio.sleep(3600)
        return
    evt = asyncio.Event()

    def _close(*args, **kwargs) -> None:  # type: ignore[no-untyped-def]
        evt.set()

    try:
        room.on("disconnected")(_close)  # type: ignore[operator]
    except Exception:
        try:
            room.on("disconnected", _close)  # type: ignore[call-arg]
        except Exception:  # noqa: BLE001
            pass

    try:
        await evt.wait()
    except Exception:  # noqa: BLE001
        pass


def create_server():
    """Build the AgentServer (importable for tests without starting it)."""
    from livekit.agents import AgentServer

    require_livekit_env()
    server = AgentServer()

    @server.rtc_session(agent_name=AGENT_NAME)
    async def sigulon_voice_session(ctx) -> None:  # type: ignore[no-untyped-def]
        raw_metadata = getattr(getattr(ctx, "job", None), "metadata", "") or ""
        room_name = getattr(getattr(ctx, "room", None), "name", "") or ""
        if not raw_metadata:
            # Fall back to room metadata (dispatch/outbound path).
            try:
                raw_metadata = getattr(getattr(ctx, "room", None), "metadata", "") or ""
            except Exception:  # noqa: BLE001
                raw_metadata = ""
        try:
            parsed = parse_job_metadata(raw_metadata)
        except Exception:  # noqa: BLE001
            parsed = {}
        # Room name maps 1:1 to session key; callId defaults to room.
        call_id = parsed.get("callId") or room_name
        metadata_for_job = raw_metadata or json.dumps({
            "orgId": parsed.get("orgId", ""),
            "agentId": parsed.get("agentId", ""),
            "callId": call_id,
            "direction": parsed.get("direction", "inbound"),
            "room": room_name,
        })
        try:
            config = await load_agent_config_for_job(metadata_for_job, room_name=room_name)
        except ConfigNotFoundError as exc:
            log.error("[voice] no config for room=%s: %s", room_name, exc)
            return
        except Exception as exc:  # noqa: BLE001
            log.exception("[voice] config load failed room=%s: %s", room_name, exc)
            return
        if not config.call_id:
            config.call_id = call_id
        if not config.room_name:
            config.room_name = room_name
        await _run_session(ctx, config, parsed if isinstance(parsed, dict) else {})

    return server


server = None
try:
    # Eager server construction is optional; cli.run_app needs it at import.
    # Env may be absent in unit tests — defer then.
    if os.getenv("LIVEKIT_URL") and os.getenv("LIVEKIT_API_KEY"):
        server = create_server()
        log.info("[voice] registered agent %s", AGENT_NAME)
except Exception as exc:  # noqa: BLE001 - import must never fail (tests)
    log.warning("[voice] server deferred (env?): %s", exc)
    server = None


if __name__ == "__main__":
    from livekit.agents import cli

    if server is None:
        server = create_server()
    log.info("[voice] starting worker agent=%s", AGENT_NAME)
    cli.run_app(server)
