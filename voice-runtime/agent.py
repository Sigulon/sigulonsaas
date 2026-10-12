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
import re
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from billing import notify_credits_reserve, notify_credits_settle
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
from lifecycle import CallLifecycle, SessionEnd, attach_transcripts, terminate_room
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
    transcript_from_context,
    transcript_from_events,
)
from subagents import SubAgentRegistry, create_handoff_tool
from tools import build_tools
from voice_stack import (
    TTS_MODEL,
    build_llm,
    build_stt,
    build_tts,
)

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

    # Runtime Prompt Injection (campaign scripts, appointment reminders, dynamic instructions)
    if config.prompt_injection and config.prompt_injection.strip():
        base = f"{base}\n\nSPECIAL RUNTIME CONTEXT & INSTRUCTIONS:\n{config.prompt_injection.strip()}"

    # Customer Context Injection
    if config.customer_context and isinstance(config.customer_context, dict):
        ctx_lines = [f"- {k}: {v}" for k, v in config.customer_context.items() if v]
        if ctx_lines:
            base = f"{base}\n\nCALLER/CUSTOMER CONTEXT:\n" + "\n".join(ctx_lines)

        # Substitute variable placeholders (e.g. {{customer_name}}, {{lead_name}}, {{phone}})
        for k, v in config.customer_context.items():
            if v is not None:
                base = re.sub(rf"\{{\{{?\s*{re.escape(str(k))}\s*\}}?\}}", lambda _: str(v).strip(), base, flags=re.IGNORECASE)

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


async def _start_recording(ctx, call_id: str) -> str | None:
    """Start a room audio recording that LiveKit Egress writes directly to R2."""
    bucket = os.getenv("R2_BUCKET_NAME", "").strip()
    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    if not all((bucket, account_id, access_key, secret)):
        log.warning("[recording] R2 credentials missing; recording egress not started")
        return None

    from livekit import api

    object_key = f"calls/{call_id}.mp3"
    request = api.RoomCompositeEgressRequest(
        room_name=ctx.room.name,
        audio_only=True,
        file_outputs=[api.EncodedFileOutput(
            filepath=object_key,
            file_type=api.EncodedFileType.MP3,
            s3=api.S3Upload(
                access_key=access_key,
                secret=secret,
                bucket=bucket,
                region="auto",
                endpoint=os.getenv(
                    "R2_ENDPOINT", f"https://{account_id}.r2.cloudflarestorage.com"
                ),
                force_path_style=True,
            ),
        )],
    )
    async with api.LiveKitAPI() as lkapi:
        result = await lkapi.egress.start_room_composite_egress(request)
    log.info("[recording] egress started room=%s egress=%s key=%s", ctx.room.name, result.egress_id, object_key)
    return str(result.egress_id)


def create_runtime_agent(instructions: str, tools: list, bundle_runner: BundleRunner | None):
    from livekit.agents import Agent

    class BundleAgent(Agent):
        async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
            if bundle_runner:
                bundle_runner.extract_variables_from_turn(new_message.text_content or "")
                await self.update_instructions(bundle_runner.get_current_instructions())

    async def update_bundle(value: str) -> None:
        await agent.update_instructions(value)

    agent_tools = list(tools)
    if bundle_runner:
        agent_tools.append(bundle_runner.create_transition_tool(update_bundle))
    agent = BundleAgent(instructions=instructions, tools=agent_tools)
    return agent


async def _run_session(ctx, config: AgentConfig, metadata: dict) -> None:
    """Admission gates run before constructing any voice providers or session."""
    call_id = config.call_id or ctx.room.name
    reserved = False
    acquired = False
    lifecycle = CallLifecycle(ctx)
    cleanup_task = None

    async def cleanup():
        try:
            await lifecycle.close()
        finally:
            if acquired:
                try:
                    await release_concurrency_slot(config.tenant_id, call_id)
                except Exception:
                    log.exception("[voice] slot release failed")
            if reserved:
                try:
                    await notify_credits_settle(call_id, lifecycle.duration)
                except Exception:
                    log.exception("[voice] settlement failed")

    async def finish(reason=""):
        nonlocal cleanup_task
        if cleanup_task is None:
            cleanup_task = asyncio.create_task(cleanup())
        try:
            await asyncio.shield(cleanup_task)
        except asyncio.CancelledError:
            await cleanup_task
            raise

    owner = asyncio.current_task()

    async def on_shutdown(reason=""):
        # Serialize shutdown with admission: never settle while a reservation
        # or concurrency acquisition is still being assigned by the owner.
        if owner is not None and not owner.done():
            owner.cancel()
            await asyncio.gather(owner, return_exceptions=True)
        await finish(reason)

    if ctx is not None:
        ctx.add_shutdown_callback(on_shutdown)
    try:
        reserved = await notify_credits_reserve(call_id)
        if not reserved:
            log.warning("[voice] billing admission denied call=%s", call_id)
            return
        acquired, _ = await acquire_concurrency_slot(
            config.tenant_id, config.max_concurrent_calls, call_id
        )
        if not acquired:
            log.warning("[voice] concurrency admission denied call=%s", call_id)
            return
        lifecycle.started = time.monotonic()
        await _run_admitted_session(ctx, config, metadata, lifecycle)
    finally:
        try:
            await finish()
        finally:
            set_gauge("active_calls", 0)
            clear_call_context()
            if ctx is not None:
                ctx.shutdown(reason="voice call ended")


async def _run_admitted_session(ctx, config: AgentConfig, metadata: dict, lifecycle: CallLifecycle) -> None:
    """Run one AgentSession for a LiveKit room (1:1 room <-> session)."""
    from livekit.agents import AgentSession
    from livekit.plugins import silero
    from livekit.plugins.turn_detector.multilingual import MultilingualModel

    room_name = ctx.room.name if getattr(ctx, "room", None) is not None else config.room_name or config.call_id
    call_id = config.call_id or room_name
    bind_call_context(call_id=call_id, tenant_id=config.tenant_id, agent_id=config.agent_id)
    tracker = VoiceLatencyTracker(call_id)
    log.info(
        "[voice] session start room=%s call=%s org=%s agent=%s dir=%s lang=%s voice=%s...",
        room_name, call_id, config.tenant_id, config.agent_id,
        config.direction, config.language, (config.voice_id or "")[:8],
    )
    inc("calls_started")
    set_gauge("active_calls", 1)

    # Build STT (Deepgram Nova-3 via LiveKit Inference) and LLM (Gemini 2.5 Flash via LiveKit Inference)
    stt = build_stt(language=config.language)
    lifecycle.resources.append(stt)
    llm = build_llm()
    lifecycle.resources.append(llm)

    # Voice UUID ALWAYS explicit from config — never default. Direct Cartesia TTS (Sonic 3.6).
    tts = build_tts(
        voice_id=config.voice_id,
        language=config.language,
        speed=config.voice_speed,
        model=config.tts_model or TTS_MODEL,
    )
    lifecycle.resources.append(tts)

    vad = silero.VAD.load()

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        turn_detection=MultilingualModel(),
        allow_interruptions=True,
        preemptive_generation=False,
    )
    lifecycle.session = session
    attach_latency_hooks(session, tracker)

    transcript_events: list[dict] = []

    bundle_runner: BundleRunner | None = None
    if isinstance(config.bundle, dict) and config.bundle.get("sections"):
        lead_data = metadata.get("raw") if isinstance(metadata, dict) else {}
        if not isinstance(lead_data, dict):
            lead_data = {}
        # Bundle prompts are node goals; retain the complete runtime prompt
        # (system prompt, injection, customer context and language rules).
        bundle_runner = BundleRunner(
            config.bundle,
            lead_data={**lead_data, "customerContext": config.customer_context},
            language=config.language,
            runtime_instructions=_instructions_for(config),
        )
        initial_instructions = bundle_runner.get_current_instructions()
        log.info("[voice] initialized bundle_runner with %d sections", len(bundle_runner.ordered_sections))
    else:
        initial_instructions = _instructions_for(config)

    # Build standard capabilities and custom tenant webhooks
    tools = build_tools(
        config.enabled_tools,
        custom_tools=config.custom_tools,
        tenant_id=config.tenant_id,
        call_id=call_id,
    )

    # Subagents & dynamic handoff orchestration
    subagent_registry = SubAgentRegistry(
        tenant_id=config.tenant_id,
        call_id=call_id,
        language=config.language,
        main_voice_id=config.voice_id,
        main_voice_speed=config.voice_speed,
    )
    subagent_registry.load_from_config(config.subagents)

    handoff_tool = create_handoff_tool(
        subagent_registry,
        tool_resolver=lambda e, c: build_tools(
            e,
            custom_tools=c or config.custom_tools,
            tenant_id=config.tenant_id,
            call_id=call_id,
        ),
        transcript_events=transcript_events,
    )
    if handoff_tool:
        tools.append(handoff_tool)

    agent = create_runtime_agent(initial_instructions, tools, bundle_runner)

    attach_transcripts(session, transcript_events, tracker)
    try:
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
        "campaign_id": config.campaign_id or "",
        "workflow_id": config.workflow_id or "",
        "customer_context": config.customer_context or {},
    }
    try:
        session.userdata = userdata  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    outbound = _is_outbound(config, metadata)
    end = SessionEnd(ctx, session)

    async def start_and_greet():
        from livekit.agents.voice.room_io import RoomOptions

        await ctx.connect()
        participant = await ctx.wait_for_participant()
        end.bind_caller(participant.identity)
        if end.event.is_set():
            return
        if config.record_calls:
            try:
                await _start_recording(ctx, call_id)
            except Exception:
                log.exception("[recording] failed to start LiveKit egress room=%s", room_name)
        await session.start(room=ctx.room, agent=agent,
                            room_options=RoomOptions(participant_identity=participant.identity))
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
    try:
        # Include connection, waiting for a callee, and greeting in the cap.
        cap = max(1, int(config.max_call_seconds or 1800))
        try:
            elapsed = time.monotonic() - lifecycle.started
            await end.run(start_and_greet(), max(0, cap - elapsed))
        except asyncio.TimeoutError:
            log.info("[voice] max_call_seconds reached room=%s", room_name)
    except Exception as exc:  # noqa: BLE001 - session errors end the call loudly
        log.exception("[voice] session failed room=%s: %s", room_name, exc)
    finally:
        await lifecycle.close()
        duration = lifecycle.duration
        tracker.emit_summary()
        try:
            transcript = transcript_from_events(transcript_events)
        except Exception:  # noqa: BLE001
            transcript = []
        # Some Agents SDK versions keep committed turns in the session chat
        # history but do not emit conversation_item_added for every turn. Use
        # that history as a fallback so a real call is not shown as empty.
        if not transcript:
            try:
                transcript = transcript_from_context(session)
            except Exception:  # noqa: BLE001
                transcript = []
        try:
            summary = await summarize_call(transcript)
        except Exception:  # noqa: BLE001
            summary = None
        captured_vars = bundle_runner.get_captured_variables() if bundle_runner else {}
        try:
            posted = await post_postcall(
                build_postcall_payload(
                    call_id=call_id,
                    transcript=transcript,
                    summary=summary,
                    duration_seconds=duration,
                    room_name=room_name,
                    captured_variables=captured_vars,
                )
            )
            if not posted:
                log.error("[voice] postcall persistence was not acknowledged call=%s", call_id)
        except Exception:  # noqa: BLE001
            log.exception("[voice] postcall persistence failed call=%s", call_id)
        inc("calls_finished")
        log.info(
            "[voice] session end room=%s call=%s duration_s=%.1f turns=%s",
            room_name, call_id, duration, len(transcript_events),
            extra={"outcome": (summary or {}).get("outcome", "completed") if summary else "completed", "duration_s": round(duration, 1)},
        )
        clear_call_context()


def create_server():
    """Build the AgentServer (importable for tests without starting it)."""
    from livekit.agents import AgentServer

    # The CLI's download-files command discovers registered plugin downloads.
    # Import them before constructing the server, without instantiating models
    # or validating call-time secrets during the image build.
    from livekit.plugins import cartesia, silero, turn_detector  # noqa: F401

    server = AgentServer()

    @server.rtc_session(agent_name=AGENT_NAME)
    async def sigulon_voice_session(ctx) -> None:  # type: ignore[no-untyped-def]
        try:
            require_livekit_env()
        except Exception:
            await terminate_room(ctx)
            raise
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

        # Security requirement: Validate all metadata before session initialization.
        # Strict tenant isolation at the application layer. Never leak prompts, tools, or data.
        tenant_id = parsed.get("orgId") or parsed.get("tenant_id")
        agent_id = parsed.get("agentId")
        if not tenant_id or not agent_id:
            log.error(
                "[voice] security validation rejected: missing tenant_id or agent_id for room=%s",
                room_name,
            )
            await terminate_room(ctx)
            return
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
            await terminate_room(ctx)
            return
        except Exception as exc:  # noqa: BLE001
            log.exception("[voice] config load failed room=%s: %s", room_name, exc)
            await terminate_room(ctx)
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
    server = create_server()
except Exception as exc:  # noqa: BLE001 - import must never fail (tests)
    log.warning("[voice] server deferred (env?): %s", exc)
    server = None


if __name__ == "__main__":
    from livekit.agents import cli

    if server is None:
        server = create_server()
    log.info("[voice] starting worker agent=%s", AGENT_NAME)
    cli.run_app(server)
