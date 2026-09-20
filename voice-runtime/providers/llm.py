"""LLM provider abstraction: OpenRouter-backed Gemini 2.5 Flash.

Only implemented providers construct — anything else fails fast with a clear
ValueError so a misconfigured agent never silently runs on an unexpected vendor.
"""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("voice-runtime.providers.llm")

SUPPORTED_LLM_PROVIDERS = ("openrouter",)
OPENROUTER_DEFAULT_MODEL_ENV_VAR = "OPENROUTER_MODEL"
OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-flash"
# Deprecated alias for the stored default — use default_openrouter_model() at runtime.
OPENROUTER_GEMINI_25_FLASH = OPENROUTER_FALLBACK_MODEL


def default_openrouter_model() -> str:
    """Effective runtime LLM model. Override with the OPENROUTER_MODEL env var."""
    return (
        os.getenv(OPENROUTER_DEFAULT_MODEL_ENV_VAR, OPENROUTER_FALLBACK_MODEL)
        or OPENROUTER_FALLBACK_MODEL
    ).strip() or OPENROUTER_FALLBACK_MODEL


def _resolve_runtime_model(model: str | None) -> str:
    requested = (model or "").strip()
    if requested:
        return requested
    return default_openrouter_model()


def create_llm_service(
    *,
    provider: str,
    model: str,
    system_prompt: str,
    api_key: str,
) -> Any:
    """Build the LLM service for one call."""
    provider = (provider or "openrouter").lower()
    if provider not in SUPPORTED_LLM_PROVIDERS:
        raise ValueError(
            f"Unknown LLM provider: {provider!r} "
            f"(want {'|'.join(SUPPORTED_LLM_PROVIDERS)})"
        )
    try:
        from pipecat.services.openai.llm import OpenAILLMService
    except ImportError as exc:
        raise RuntimeError(
            "OpenRouter LLM selected but 'pipecat-ai[openai]' is not installed."
        ) from exc

    base_url = "https://openrouter.ai/api/v1"
    model = _resolve_runtime_model(model)

    log.info("LLM: %s model=%s prompt_chars=%d", provider, model, len(system_prompt or ""))
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "settings": OpenAILLMService.Settings(
            model=model,
            system_instruction=system_prompt,
        ),
    }
    kwargs["base_url"] = base_url

    return OpenAILLMService(**kwargs)


__all__ = [
    "OPENROUTER_DEFAULT_MODEL_ENV_VAR",
    "OPENROUTER_FALLBACK_MODEL",
    "OPENROUTER_GEMINI_25_FLASH",
    "SUPPORTED_LLM_PROVIDERS",
    "create_llm_service",
    "default_openrouter_model",
]
