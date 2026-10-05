"""LLM descriptor: LiveKit Inference (Google Gemini 2.5 Flash).

Target model: `google/gemini-2.5-flash` via LiveKit Inference gateway.
No provider API key required (billed & routed through LiveKit Cloud).
"""

from __future__ import annotations

import logging
from typing import Any

from voice_stack import (
    LLM_MODEL,
    SUPPORTED_LLM_PROVIDER,
    build_llm as _build_llm,
)

log = logging.getLogger("voice-runtime.providers.llm")

SUPPORTED_LLM_PROVIDERS = (SUPPORTED_LLM_PROVIDER,)
PRIMARY_LLM_MODEL = LLM_MODEL


def build_llm(*, max_tokens: int = 120, temperature: float = 0.7) -> Any:
    """Build the LiveKit Inference LLM (Gemini 2.5 Flash)."""
    return _build_llm(max_tokens=max_tokens, temperature=temperature)


def create_llm_service(*args: Any, **kwargs: Any) -> Any:
    """Back-compat alias for build_llm."""
    return build_llm()


__all__ = [
    "LLM_MODEL",
    "PRIMARY_LLM_MODEL",
    "SUPPORTED_LLM_PROVIDERS",
    "build_llm",
    "create_llm_service",
]
