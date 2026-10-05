"""Sigulon Consolidated Voice Stack (Single Source of Truth).

The ONLY approved voice pipeline for Sigulon:
- LLM: Google Gemini 2.5 Flash via LiveKit Inference ("google/gemini-2.5-flash")
- STT: Deepgram Nova-3 via LiveKit Inference ("deepgram/nova-3")
- TTS: Cartesia Sonic 3.6 via direct Cartesia plugin ("sonic-3.6")

No provider API keys are required for LLM or STT (billed & routed via LiveKit Cloud).
TTS requires only CARTESIA_API_KEY.
"""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("voice-runtime.voice_stack")

# Target models
LLM_MODEL: str = "google/gemini-2.5-flash"
STT_MODEL: str = "deepgram/nova-3"
TTS_MODEL: str = "sonic-3.6"

# Supported voice providers (frozen)
SUPPORTED_LLM_PROVIDER: str = "livekit-inference"
SUPPORTED_STT_PROVIDER: str = "livekit-inference"
SUPPORTED_TTS_PROVIDER: str = "cartesia"

TTS_SPEED_MIN: float = 0.6
TTS_SPEED_MAX: float = 1.5


def clamp_voice_speed(speed: float) -> float:
    """Clamp a TTS speed multiplier into Cartesia's valid range [0.6, 1.5]."""
    try:
        value = float(speed)
    except (TypeError, ValueError):
        return 1.0
    return max(TTS_SPEED_MIN, min(TTS_SPEED_MAX, value))


def build_llm(*, max_tokens: int = 120, temperature: float = 0.7) -> Any:
    """Build the primary LiveKit Inference LLM (Gemini 2.5 Flash)."""
    try:
        from livekit.agents import inference
    except ImportError as exc:
        raise RuntimeError("The 'livekit-agents' package is required.") from exc

    log.info("[voice-stack] building LLM: model=%s (LiveKit Inference)", LLM_MODEL)
    return inference.LLM(LLM_MODEL)


def build_stt(*, language: str) -> Any:
    """Build the LiveKit Inference STT (Deepgram Nova-3).

    Resolves ISO/BCP-47 language codes (te-IN -> te, hi-IN -> hi, en-IN -> en).
    """
    from language import resolve_deepgram_language

    lang = resolve_deepgram_language(language)
    try:
        from livekit.agents import inference
    except ImportError as exc:
        raise RuntimeError("The 'livekit-agents' package is required.") from exc

    log.info("[voice-stack] building STT: model=%s language=%s (LiveKit Inference)", STT_MODEL, lang)
    return inference.STT(STT_MODEL, language=lang)


def build_tts(
    *,
    voice_id: str,
    language: str = "te",
    speed: float = 1.0,
    model: str = TTS_MODEL,
) -> Any:
    """Build the direct Cartesia TTS (Sonic 3.6). Voice UUID is required."""
    if not (voice_id or "").strip():
        raise ValueError("Cartesia voice_id (UUID) must be explicit from config — never default.")

    try:
        from livekit.plugins import cartesia as cartesia_plugin
    except ImportError as exc:
        raise RuntimeError("The 'livekit-plugins-cartesia' package is required.") from exc

    clamped = clamp_voice_speed(speed)
    if clamped != speed:
        log.warning("[voice-stack] TTS speed %r clamped to %s", speed, clamped)

    log.info(
        "[voice-stack] building TTS: model=%s voice=%s... speed=%s (Cartesia Direct)",
        model,
        voice_id[:8],
        clamped,
    )
    return cartesia_plugin.TTS(model=model, voice=voice_id, speed=clamped)


__all__ = [
    "LLM_MODEL",
    "STT_MODEL",
    "TTS_MODEL",
    "SUPPORTED_LLM_PROVIDER",
    "SUPPORTED_STT_PROVIDER",
    "SUPPORTED_TTS_PROVIDER",
    "build_llm",
    "build_stt",
    "build_tts",
    "clamp_voice_speed",
]
