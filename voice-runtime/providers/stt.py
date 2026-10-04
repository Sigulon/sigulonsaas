"""STT descriptor: LiveKit Inference (Deepgram Nova-3).

Target model: `deepgram/nova-3` via LiveKit Inference gateway.
Supports Telugu, Hindi, English, and multilingual speech.
No provider API key required (billed & routed through LiveKit Cloud).
"""

from __future__ import annotations

import logging
from typing import Any

from voice_stack import (
    STT_MODEL,
    SUPPORTED_STT_PROVIDER,
    build_stt as _build_stt,
)

log = logging.getLogger("voice-runtime.providers.stt")

SUPPORTED_STT_PROVIDERS = (SUPPORTED_STT_PROVIDER,)
PRIMARY_STT_MODEL = STT_MODEL


def default_stt_model(provider: str, language: str) -> str:
    """Primary streaming STT model for the requested language."""
    return PRIMARY_STT_MODEL


def build_stt(*, language: str, provider: str = SUPPORTED_STT_PROVIDER) -> Any:
    """Build the LiveKit Inference STT (Deepgram Nova-3)."""
    return _build_stt(language=language)


def create_stt_service(*args: Any, **kwargs: Any) -> Any:
    """Back-compat alias for build_stt."""
    language = kwargs.get("language", "en")
    return build_stt(language=language)


__all__ = [
    "PRIMARY_STT_MODEL",
    "STT_MODEL",
    "SUPPORTED_STT_PROVIDERS",
    "build_stt",
    "create_stt_service",
    "default_stt_model",
]
