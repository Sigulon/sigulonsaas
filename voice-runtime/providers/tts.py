"""TTS descriptor (Cartesia Sonic 3).

Voice UUID is ALWAYS explicit from config — never defaulted. Speed comes from
the agent's settings (Cartesia range 0.6–1.5) and is clamped here so a bad
row never errors the whole session.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("voice-runtime.providers.tts")

SUPPORTED_TTS_PROVIDERS = ("cartesia",)
PRIMARY_TTS_MODEL = "sonic-3"

_TTS_SPEED_MIN = 0.6
_TTS_SPEED_MAX = 1.5


def clamp_voice_speed(speed: float) -> float:
    """Clamp a TTS speed multiplier into Cartesia's valid range."""
    try:
        value = float(speed)
    except (TypeError, ValueError):
        return 1.0
    return max(_TTS_SPEED_MIN, min(_TTS_SPEED_MAX, value))


def build_tts(*, voice_id: str, language: str, speed: float = 1.0, model: str = PRIMARY_TTS_MODEL):
    """Build the Cartesia TTS for one session. Voice UUID required."""
    if not (voice_id or "").strip():
        raise ValueError("Cartesia voice_id (UUID) must be explicit from config — never default.")
    try:
        from livekit.plugins import cartesia as cartesia_plugin
    except ImportError as exc:
        raise RuntimeError("The 'livekit-plugins-cartesia' package is required.") from exc
    clamped = clamp_voice_speed(speed)
    if clamped != speed:
        log.warning("TTS speed %r out of range; clamped to %s", speed, clamped)
    log.info(
        "[cartesia-tts] configuring model=%s voice=%s... speed=%s",
        model, voice_id[:8], clamped,
    )
    return cartesia_plugin.TTS(model=model, voice=voice_id, speed=clamped)


def create_tts_service(*args: Any, **kwargs: Any):
    """Back-compat alias for build_tts (old legacy-rtc-era import path)."""
    return build_tts(
        voice_id=kwargs.get("voice_id", ""),
        language=kwargs.get("language", "en"),
        speed=kwargs.get("speed", 1.0),
        model=kwargs.get("model", PRIMARY_TTS_MODEL),
    )


__all__ = ["PRIMARY_TTS_MODEL", "SUPPORTED_TTS_PROVIDERS", "build_tts", "clamp_voice_speed", "create_tts_service"]
