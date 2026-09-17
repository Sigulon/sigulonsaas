"""Cartesia STT provider factory.

Pipeline audio is 16 kHz signed PCM. Stored Sigulon bundle languages are
resolved to Cartesia's API values before this module constructs Pipecat's
WebSocket service.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

log = logging.getLogger("voice-runtime.providers.stt")

SUPPORTED_STT_PROVIDERS = ("cartesia",)


def default_stt_model(provider: str, language: str) -> str:
    """Cartesia's best streaming model for the requested language."""
    from language import (
        CARTESIA_STT_ENGLISH_MODEL,
        CARTESIA_STT_MULTILINGUAL_MODEL,
        resolve_cartesia_language,
    )

    if (provider or "cartesia").lower() != "cartesia":
        raise ValueError(f"Unknown STT provider: {provider!r}")
    return (
        CARTESIA_STT_ENGLISH_MODEL
        if resolve_cartesia_language(language) == "en"
        else CARTESIA_STT_MULTILINGUAL_MODEL
    )


def create_stt_service(
    *,
    provider: str,
    language: str,
    model: Optional[str],
    api_key: str,
    sample_rate: int = 16000,
) -> Any:
    """Build the Cartesia STT service for one call.

    Raises:
        ValueError: for unknown providers (fail fast — never substitute a
            different vendor mid-call).
        RuntimeError: when the provider's Pipecat extra is not installed.
    """
    provider = (provider or "cartesia").lower()
    if provider == "cartesia":
        from language import resolve_cartesia_stt_language

        resolved_language, effective_model = resolve_cartesia_stt_language(
            language=language,
            model=model,
        )

        try:
            from pipecat.services.cartesia.stt import CartesiaSTTService
        except ImportError as exc:
            raise RuntimeError(
                "Cartesia STT selected but 'pipecat-ai[cartesia]' is not installed."
            ) from exc

        log.info(
            "[cartesia-stt] configuring model=%s language=%s input=pcm_s16le/%sHz",
            effective_model,
            resolved_language,
            sample_rate,
        )
        return CartesiaSTTService(
            api_key=api_key,
            encoding="pcm_s16le",
            sample_rate=sample_rate,
            settings=CartesiaSTTService.Settings(model=effective_model, language=resolved_language),
        )

    raise ValueError(
        f"Unknown STT provider: {provider!r} (want {'|'.join(SUPPORTED_STT_PROVIDERS)})"
    )


__all__ = [
    "SUPPORTED_STT_PROVIDERS",
    "create_stt_service",
    "default_stt_model",
]
