"""TTS provider abstraction (Cartesia Sonic 3 / Sonic 3.5).

Speed comes from the agent's ``settings.speed`` (Cartesia range 0.6–1.5) and
is clamped here so a bad row never errors the whole pipeline — it logs and
uses the nearest valid value instead.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("voice-runtime.providers.tts")

SUPPORTED_TTS_PROVIDERS = ("cartesia",)

_TTS_SPEED_MIN = 0.6
_TTS_SPEED_MAX = 1.5


def clamp_voice_speed(speed: float) -> float:
    """Clamp a TTS speed multiplier into Cartesia's valid range."""
    try:
        value = float(speed)
    except (TypeError, ValueError):
        return 1.0
    return max(_TTS_SPEED_MIN, min(_TTS_SPEED_MAX, value))


def create_tts_service(
    *,
    provider: str,
    model: str,
    voice_id: str,
    language: str,
    speed: float,
    api_key: str,
) -> Any:
    """Build the TTS service for one call."""
    provider = (provider or "cartesia").lower()
    if provider != "cartesia":
        raise ValueError(
            f"Unknown TTS provider: {provider!r} "
            f"(want {'|'.join(SUPPORTED_TTS_PROVIDERS)})"
        )
    from language import resolve_cartesia_tts_language

    resolved_language, effective_model = resolve_cartesia_tts_language(
        language=language,
        model=model,
    )
    try:
        from pipecat.services.cartesia.tts import CartesiaTTSService, GenerationConfig
    except ImportError as exc:
        raise RuntimeError(
            "Cartesia TTS selected but 'pipecat-ai[cartesia]' is not installed."
        ) from exc
    clamped = clamp_voice_speed(speed)
    if clamped != speed:
        log.warning("TTS speed %r out of range; clamped to %s", speed, clamped)
    log.info(
        "[cartesia-tts] configuring model=%s voice=%s... language=%s "
        "output=raw/pcm_s16le/16000Hz speed=%s",
        effective_model, voice_id[:8] if voice_id else "none", resolved_language, clamped,
    )
    return CartesiaTTSService(
        api_key=api_key,
        encoding="pcm_s16le",
        container="raw",
        sample_rate=16000,
        settings=CartesiaTTSService.Settings(
            model=effective_model,
            voice=voice_id,
            language=resolved_language,
            generation_config=GenerationConfig(speed=clamped),
        ),
    )


__all__ = ["SUPPORTED_TTS_PROVIDERS", "clamp_voice_speed", "create_tts_service"]
