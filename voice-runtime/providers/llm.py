"""LLM provider abstraction: OpenRouter-backed Gemini 2.5 Flash.

Only implemented providers construct — anything else fails fast with a clear
ValueError so a misconfigured agent never silently runs on an unexpected vendor.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("voice-runtime.providers.llm")

SUPPORTED_LLM_PROVIDERS = ("openrouter",)
OPENROUTER_GEMINI_25_FLASH = "google/gemini-2.5-flash"


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
    model = OPENROUTER_GEMINI_25_FLASH

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


__all__ = ["SUPPORTED_LLM_PROVIDERS", "create_llm_service"]
