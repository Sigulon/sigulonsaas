"""Per-call Pipecat pipeline builder for the Sigulon voice runtime.

Pipeline shape (one instance per call)::

    transport.input()
      -> VADProcessor (Silero; Plivo does no turn-detection itself)
      -> Cartesia STT (model selected by language — see below)
      -> LLM user aggregator
      -> OpenRouter Gemini 2.5 Flash LLM (+ function-calling tools)
      -> Cartesia TTS
      -> transport.output()
      -> LLM assistant aggregator

STT language routing
--------------------
Cartesia's streaming STT story (verified against Cartesia docs, 2026):

* ``ink-2`` — streaming + built-in turn detection, **English only**.
* ``ink-whisper`` — multilingual streaming model, no turn detection
  (Pipecat's local Silero VAD covers turn-taking instead).

The service is intentionally fixed to Cartesia for both STT and TTS.

Barge-in: the serializer turns ``InterruptionFrame`` into Plivo
``clearAudio``; turn tracking on the worker is left at its default
(enabled), so callers can interrupt mid-sentence.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

log = logging.getLogger("voice-runtime.pipeline")

PIPELINE_SAMPLE_RATE = 16000

# -- provider factories (thin re-exports; implementations live in providers/) --
# Kept under the same names so existing imports keep working; new code
# should import from ``providers`` directly.


def default_stt_model(provider: str, language: str) -> str:
    """Factory default model for a (provider, language) pair."""
    from providers.stt import default_stt_model as _default

    return _default(provider, language)


def create_stt_service(
    *,
    provider: str,
    language: str,
    model: Optional[str],
    api_key: str,
    sample_rate: int = PIPELINE_SAMPLE_RATE,
) -> Any:
    """Build the STT service for this call (swappable per tenant/language)."""
    from providers.stt import create_stt_service as _create

    return _create(
        provider=provider,
        language=language,
        model=model,
        api_key=api_key,
        sample_rate=sample_rate,
    )


def create_llm_service(
    *,
    provider: str,
    model: str,
    system_prompt: str,
    api_key: str,
) -> Any:
    """Build the LLM service for this call (swappable per tenant)."""
    from providers.llm import create_llm_service as _create

    return _create(
        provider=provider, model=model,
        system_prompt=system_prompt, api_key=api_key,
    )


def create_tts_service(
    *,
    provider: str,
    model: str,
    voice_id: str,
    language: str,
    speed: float,
    api_key: str,
) -> Any:
    """Build the TTS service for this call (swappable per tenant)."""
    from providers.tts import create_tts_service as _create

    return _create(
        provider=provider, model=model, voice_id=voice_id,
        language=language, speed=speed, api_key=api_key,
    )


def resolve_api_keys(config: Any) -> dict[str, str]:
    """Resolve effective API keys: per-call BYOK override -> environment."""
    return {
        "cartesia": getattr(config, "cartesia_api_key", None)
        or os.getenv("CARTESIA_API_KEY", ""),
        "openrouter": getattr(config, "openrouter_api_key", None)
        or os.getenv("OPENROUTER_API_KEY", ""),
    }


# -- tools ------------------------------------------------------------------


def build_tools(enabled_tools: list[str]) -> list[Any]:
    """Return the advertised tool schemas for this agent (unknown names warn)."""
    from tools import TOOL_REGISTRY

    tools: list[Any] = []
    for name in enabled_tools or []:
        schema = TOOL_REGISTRY.get(name)
        if schema is None:
            log.warning("Unknown tool %r in enabled_tools; skipping", name)
            continue
        tools.append(schema)
    log.info("Advertised tools: %s", [getattr(t, "name", t) for t in tools])
    return tools


# -- pipeline assembly -------------------------------------------------------


@dataclass
class CallResources:
    """Shared resources visible to every tool handler via ``params.app_resources``."""

    call_id: str
    tenant_id: str
    agent_id: str


@dataclass
class CallPipeline:
    """Everything ``main.py`` needs to run (and greet on) one call."""

    transport: Any
    pipeline: Any
    worker: Any
    runner: Any
    llm: Any
    introduction: Optional[str]
    context: Any = None  # LLMContext: post-call transcript snapshot source
    recorder: Any = None  # CallAudioRecorder: dual-track WAV recording source
    latency: Any = None  # VoiceLatencyTracker: per-turn timing source


class CallSetupError(RuntimeError):
    """Raised when the pipeline cannot be built (missing keys, bad config)."""


async def build_call_pipeline(websocket: Any, config: Any, *, latency: Any = None) -> CallPipeline:
    """Assemble transport + services + pipeline + worker for one call.

    Raises:
        CallSetupError: if required API keys are missing or a service fails
            to construct. The caller must end the call gracefully (never
            leave a dead WebSocket open).
    """
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.worker import PipelineParams, PipelineWorker
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContextAggregatorPair,
    )
    from pipecat.processors.audio.vad_processor import VADProcessor
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )
    from pipecat.workers.runner import WorkerRunner

    from config import AgentConfig
    from language import CartesiaLanguageConfigurationError, validate_cartesia_speech_config
    from providers.llm import SUPPORTED_LLM_PROVIDERS
    from providers.stt import SUPPORTED_STT_PROVIDERS
    from providers.tts import SUPPORTED_TTS_PROVIDERS
    from serializers.plivo import SigulonPlivoSerializer
    from latency import (
        LlmLatencyProcessor,
        SttLatencyProcessor,
        TtsLatencyProcessor,
        TurnEndLatencyProcessor,
        VoiceLatencyTracker,
    )

    assert isinstance(config, AgentConfig)
    keys = resolve_api_keys(config)

    # Provider allow-list: the config selects vendors, but only implemented
    # providers construct. Anything else fails fast with a clear error —
    # never silently substitute a different vendor mid-call.
    if config.llm_provider not in SUPPORTED_LLM_PROVIDERS:
        raise CallSetupError(
            f"Unsupported llm_provider {config.llm_provider!r} for agent "
            f"{config.agent_id} (only {','.join(SUPPORTED_LLM_PROVIDERS)} implemented)."
        )
    if config.tts_provider not in SUPPORTED_TTS_PROVIDERS:
        raise CallSetupError(
            f"Unsupported tts_provider {config.tts_provider!r} for agent "
            f"{config.agent_id} (only {','.join(SUPPORTED_TTS_PROVIDERS)} implemented)."
        )
    if config.stt_provider not in SUPPORTED_STT_PROVIDERS:
        raise CallSetupError(
            f"Unsupported stt_provider {config.stt_provider!r} for agent "
            f"{config.agent_id} (want {'|'.join(SUPPORTED_STT_PROVIDERS)})."
        )
    stt_key = keys.get(config.stt_provider, "")
    if not keys["cartesia"]:
        raise CallSetupError("CARTESIA_API_KEY is not configured.")
    llm_key = keys.get(config.llm_provider, "")
    if not llm_key:
        raise CallSetupError(f"{config.llm_provider.upper()}_API_KEY is not configured.")
    if not config.voice_id:
        raise CallSetupError("Agent has no Cartesia voice_id configured.")

    try:
        resolved_languages = validate_cartesia_speech_config(
            language=config.language,
            stt_model=config.stt_model,
            tts_model=config.tts_model,
        )
    except CartesiaLanguageConfigurationError as exc:
        log.error(
            "[TTS_CONFIG_ERROR] provider=cartesia language=%s model=%s voice=%s... reason=%s",
            config.language,
            config.tts_model,
            config.voice_id[:8],
            exc,
        )
        raise CallSetupError(f"Invalid Cartesia speech configuration: {exc}") from exc
    log.info(
        "[cartesia] resolved config sigulon_language=%s stt_language=%s "
        "tts_language=%s stt_model=%s tts_model=%s voice=%s...",
        config.language,
        resolved_languages.stt_language,
        resolved_languages.tts_language,
        config.stt_model or default_stt_model(config.stt_provider, config.language),
        config.tts_model,
        config.voice_id[:8],
    )

    try:
        # -- transport (Plivo Audio Streaming over this WebSocket) ----------
        latency = latency or VoiceLatencyTracker(config.call_id)
        serializer = SigulonPlivoSerializer(
            call_id=config.call_id,
            on_first_audio=latency.mark_plivo_first_audio,
        )
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                audio_in_sample_rate=PIPELINE_SAMPLE_RATE,
                audio_out_sample_rate=PIPELINE_SAMPLE_RATE,
                add_wav_header=False,
                serializer=serializer,
            ),
        )

        # -- speech services (one factory branch per vendor) ----------------
        try:
            log.info("[cartesia-stt] connecting")
            stt = create_stt_service(
                provider=config.stt_provider,
                language=resolved_languages.stt_language,
                model=config.stt_model,
                api_key=stt_key,
            )
        except (ValueError, RuntimeError) as exc:
            raise CallSetupError(f"STT setup failed: {exc}") from exc

        @stt.event_handler("on_connected")
        async def _cartesia_stt_connected(*args: Any, **kwargs: Any) -> None:
            log.info("[cartesia-stt] connected configuration accepted")

        @stt.event_handler("on_disconnected")
        async def _cartesia_stt_disconnected(*args: Any, **kwargs: Any) -> None:
            log.info("[cartesia-stt] websocket closed")

        @stt.event_handler("on_connection_error")
        async def _cartesia_stt_connection_error(*args: Any, **kwargs: Any) -> None:
            err = args[0] if args else kwargs.get("error", "")
            log.error("[cartesia-stt] connection error: %s", str(err)[:300])

        try:
            llm = create_llm_service(
                provider=config.llm_provider,
                model=config.llm_model,
                system_prompt=config.system_prompt,
                api_key=llm_key,
            )
        except (ValueError, RuntimeError) as exc:
            raise CallSetupError(f"LLM setup failed: {exc}") from exc

        try:
            tts = create_tts_service(
                provider=config.tts_provider,
                model=config.tts_model,
                voice_id=config.voice_id,
                language=resolved_languages.tts_language,
                speed=config.voice_speed,
                api_key=keys["cartesia"],
            )
        except (ValueError, RuntimeError) as exc:
            raise CallSetupError(f"TTS setup failed: {exc}") from exc

        @tts.event_handler("on_error")
        async def _cartesia_tts_error(*args: Any, **kwargs: Any) -> None:
            err = args[0] if args else kwargs.get("error", "")
            log.error(
                "[TTS_CONFIG_ERROR] provider=cartesia language=%s model=%s voice=%s... reason=%s",
                resolved_languages.tts_language,
                config.tts_model,
                config.voice_id[:8],
                str(err)[:300],
            )

        # -- conversation context (+ per-agent tools) ------------------------
        context = LLMContext(tools=build_tools(config.enabled_tools))
        pair = LLMContextAggregatorPair(context)

        # -- call audio recording (Pipecat dual-track sync) -------------------
        from recording import CallAudioRecorder

        recorder = CallAudioRecorder(sample_rate=PIPELINE_SAMPLE_RATE)

        # -- pipeline ---------------------------------------------------------
        pipeline = Pipeline(
            [
                transport.input(),
                recorder.user_tap,
                VADProcessor(vad_analyzer=SileroVADAnalyzer()),
                TurnEndLatencyProcessor(latency),
                stt,
                SttLatencyProcessor(latency),
                pair.user(),
                llm,
                LlmLatencyProcessor(latency),
                tts,
                TtsLatencyProcessor(latency),
                recorder.bot_tap,
                transport.output(),
                pair.assistant(),
            ]
        )
        worker = PipelineWorker(
            pipeline,
            params=PipelineParams(
                audio_in_sample_rate=PIPELINE_SAMPLE_RATE,
                audio_out_sample_rate=PIPELINE_SAMPLE_RATE,
            ),
            app_resources=CallResources(
                call_id=config.call_id,
                tenant_id=config.tenant_id,
                agent_id=config.agent_id,
            ),
        )
        runner = WorkerRunner()
        await runner.add_workers(worker)
    except CallSetupError:
        raise
    except Exception as exc:  # noqa: BLE001 - wrap with call context
        raise CallSetupError(f"Pipeline assembly failed: {exc}") from exc

    log.info(
        "Pipeline built (call=%s agent=%s lang=%s stt=%s llm=%s voice=%s...)",
        config.call_id, config.agent_id, config.language,
        config.stt_provider, config.llm_model, config.voice_id[:8],
    )
    return CallPipeline(
        transport=transport,
        pipeline=pipeline,
        worker=worker,
        runner=runner,
        llm=llm,
        introduction=config.introduction,
        context=context,
        recorder=recorder,
        latency=latency,
    )
