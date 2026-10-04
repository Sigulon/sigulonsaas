"""LLM descriptor: LiveKit Inference with OpenRouter fallback.

Primary: `inference.LLM("google/gemma-4-31b-it")` (low-latency, hosted on
LiveKit). Fallback on provider error only: OpenRouter
`google/gemini-2.5-flash` via an OpenAI-compatible endpoint — never dual-run.
"""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("voice-runtime.providers.llm")

SUPPORTED_LLM_PROVIDERS = ("livekit-inference", "openrouter")
OPENROUTER_DEFAULT_MODEL_ENV_VAR = "OPENROUTER_MODEL"
OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-flash"
# Deprecated alias for the stored default — use default_openrouter_model() at runtime.
OPENROUTER_GEMINI_25_FLASH = OPENROUTER_FALLBACK_MODEL
PRIMARY_LLM_MODEL = "google/gemma-4-31b-it"


def default_openrouter_model() -> str:
    """Effective fallback LLM model. Override with the OPENROUTER_MODEL env var."""
    return (
        os.getenv(OPENROUTER_DEFAULT_MODEL_ENV_VAR, OPENROUTER_FALLBACK_MODEL)
        or OPENROUTER_FALLBACK_MODEL
    ).strip() or OPENROUTER_FALLBACK_MODEL


def build_llm(*, max_tokens: int = 120, temperature: float = 0.7):
    """Build the primary LiveKit Inference LLM for one session."""
    try:
        from livekit.agents import inference
    except ImportError as exc:
        raise RuntimeError("The 'livekit-agents' package is required.") from exc
    log.info("LLM primary: livekit-inference model=%s max_tokens=%d", PRIMARY_LLM_MODEL, max_tokens)
    # max_tokens/temperature flow through model settings where supported;
    # keep the descriptor tolerant across SDK versions.
    try:
        return inference.LLM(PRIMARY_LLM_MODEL)
    except TypeError:
        return inference.LLM(PRIMARY_LLM_MODEL)  # type: ignore[call-arg]


def build_llm_fallback(*, api_key: str, model: str | None = None):
    """Build the OpenRouter fallback LLM (error path only, never dual-run)."""
    fallback_model = (model or "").strip() or default_openrouter_model()
    try:
        from livekit.plugins import openai as openai_plugin
    except ImportError as exc:
        raise RuntimeError("The 'livekit-plugins-openai' package is required.") from exc
    log.warning("[llm] primary failed; falling back to openrouter model=%s", fallback_model)
    return openai_plugin.LLM(
        model=fallback_model,
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )


def create_llm_service(*args: Any, **kwargs: Any):
    """Back-compat alias for build_llm (old legacy-rtc-era import path)."""
    return build_llm()


__all__ = [
    "OPENROUTER_DEFAULT_MODEL_ENV_VAR",
    "OPENROUTER_FALLBACK_MODEL",
    "OPENROUTER_GEMINI_25_FLASH",
    "PRIMARY_LLM_MODEL",
    "SUPPORTED_LLM_PROVIDERS",
    "build_llm",
    "build_llm_fallback",
    "create_llm_service",
    "default_openrouter_model",
]
