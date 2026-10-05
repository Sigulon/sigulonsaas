"""TTS descriptor: Direct Cartesia Sonic 3.6.

Voice UUID is ALWAYS explicit from config — never defaulted. Speed comes from
the agent's settings (Cartesia range 0.6–1.5) and is clamped here so a bad
row never errors the whole session.
"""

from __future__ import annotations

import logging
from typing import Any

from voice_stack import (
    SUPPORTED_TTS_PROVIDER,
    TTS_MODEL,
    build_tts as _build_tts,
    clamp_voice_speed,
)

log = logging.getLogger("voice-runtime.providers.tts")

SUPPORTED_TTS_PROVIDERS = (SUPPORTED_TTS_PROVIDER,)
PRIMARY_TTS_MODEL = TTS_MODEL


def build_tts(
    *,
    voice_id: str,
    language: str = "te",
    speed: float = 1.0,
    model: str = PRIMARY_TTS_MODEL,
) -> Any:
    """Build the direct Cartesia TTS for one session. Voice UUID required."""
    return _build_tts(voice_id=voice_id, language=language, speed=speed, model=model)


def create_tts_service(*args: Any, **kwargs: Any) -> Any:
    """Back-compat alias for build_tts."""
    return build_tts(
        voice_id=kwargs.get("voice_id", ""),
        language=kwargs.get("language", "te"),
        speed=kwargs.get("speed", 1.0),
        model=kwargs.get("model", PRIMARY_TTS_MODEL),
    )


__all__ = [
    "PRIMARY_TTS_MODEL",
    "SUPPORTED_TTS_PROVIDERS",
    "TTS_MODEL",
    "build_tts",
    "clamp_voice_speed",
    "create_tts_service",
]
