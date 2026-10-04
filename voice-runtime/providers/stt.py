"""STT descriptor: LiveKit Inference `deepgram/nova-3` (AssemblyAI fallback).

Never dual-run: primary is always deepgram/nova-3 via the Inference gateway;
AssemblyAI is constructed only after a provider error on the primary path
(see agent.py fallback).
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("voice-runtime.providers.stt")

SUPPORTED_STT_PROVIDERS = ("deepgram", "assemblyai")
PRIMARY_STT_MODEL = "deepgram/nova-3"
FALLBACK_STT_MODEL = "assemblyai/universal-streaming"


def default_stt_model(provider: str, language: str) -> str:
    """Primary streaming STT model for the requested language."""
    from language import resolve_deepgram_language

    provider = (provider or "deepgram").lower()
    if provider not in SUPPORTED_STT_PROVIDERS:
        raise ValueError(f"Unknown STT provider: {provider!r}")
    lang = resolve_deepgram_language(language)
    log.info("[deepgram-stt] default model=%s language=%s", PRIMARY_STT_MODEL, lang)
    return PRIMARY_STT_MODEL


def build_stt(*, language: str, provider: str = "deepgram"):
    """Build the LiveKit Inference STT for one session.

    Returns an `inference.STT` instance. Raises RuntimeError when the
    livekit-agents package is missing (deploy config error).
    """
    from language import resolve_deepgram_language

    lang = resolve_deepgram_language(language)
    try:
        from livekit.agents import inference
    except ImportError as exc:
        raise RuntimeError("The 'livekit-agents' package is required.") from exc
    if (provider or "deepgram").lower() == "assemblyai":
        log.info("[assemblyai-stt] fallback model=%s language=%s", FALLBACK_STT_MODEL, lang)
        return inference.STT(FALLBACK_STT_MODEL, language=lang)
    log.info("[deepgram-stt] configuring model=%s language=%s", PRIMARY_STT_MODEL, lang)
    return inference.STT(PRIMARY_STT_MODEL, language=lang)


def build_stt_fallback(*, language: str):
    """Build the AssemblyAI fallback STT (error path only, never dual-run)."""
    from language import resolve_deepgram_language

    lang = resolve_deepgram_language(language)
    try:
        from livekit.agents import inference
    except ImportError as exc:
        raise RuntimeError("The 'livekit-agents' package is required.") from exc
    log.warning("[stt] primary failed; falling back to %s language=%s", FALLBACK_STT_MODEL, lang)
    return inference.STT(FALLBACK_STT_MODEL, language=lang)


def create_stt_service(*args: Any, **kwargs: Any):
    """Back-compat alias for build_stt (old legacy-rtc-era import path)."""
    language = kwargs.get("language", "en")
    provider = kwargs.get("provider", "deepgram")
    return build_stt(language=language, provider=provider)


__all__ = [
    "FALLBACK_STT_MODEL",
    "PRIMARY_STT_MODEL",
    "SUPPORTED_STT_PROVIDERS",
    "build_stt",
    "build_stt_fallback",
    "create_stt_service",
    "default_stt_model",
]
