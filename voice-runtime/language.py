"""Sigulon-to-Cartesia language resolution.

Agent bundles and the web application preserve their application-level language values
(e.g., "te-IN", "hi-IN", "ta-IN", "en-IN", "te", "hi", "ta", "en").
Cartesia's current Sonic 3 / Sonic 3.5 and Ink Whisper APIs accept the base ISO-639-1
values instead ("te", "hi", "ta", "en"). Mapping must happen only at the provider
boundary, never while storing an agent or exporting its bundle.

The supported model/language pairs below are verified against Cartesia APIs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("voice-runtime.language")

CARTESIA_TTS_DEFAULT_MODEL = "sonic-3"
CARTESIA_TTS_ALLOWED_MODELS = frozenset(("sonic-3", "sonic-3.5"))
CARTESIA_STT_ENGLISH_MODEL = "ink-2"
CARTESIA_STT_MULTILINGUAL_MODEL = "ink-whisper"
CARTESIA_STT_ALLOWED_MODELS = frozenset(("ink-2", "ink-whisper"))

# Cartesia STT/TTS accepts these exact base codes for Sigulon's languages
SIGULON_TO_CARTESIA_LANGUAGE: dict[str, str] = {
    "en": "en",
    "en-in": "en",
    "en-us": "en",
    "en-gb": "en",
    "hi": "hi",
    "hi-in": "hi",
    "ta": "ta",
    "ta-in": "ta",
    "te": "te",
    "te-in": "te",
    "kn": "kn",
    "kn-in": "kn",
    "mr": "mr",
    "mr-in": "mr",
    "bn": "bn",
    "bn-in": "bn",
    "gu": "gu",
    "gu-in": "gu",
    "ml": "ml",
    "ml-in": "ml",
    "pa": "pa",
    "pa-in": "pa",
}

CARTESIA_TTS_SUPPORTED_LANGUAGES = frozenset(SIGULON_TO_CARTESIA_LANGUAGE.values())
CARTESIA_INK_WHISPER_SUPPORTED_LANGUAGES = CARTESIA_TTS_SUPPORTED_LANGUAGES
CARTESIA_INK_2_SUPPORTED_LANGUAGES = frozenset(("en",))


class CartesiaLanguageConfigurationError(ValueError):
    """A stored Sigulon language cannot be used by the selected Cartesia model."""


@dataclass(frozen=True)
class CartesiaLanguageConfig:
    """Validated service-specific language values for one call."""

    sigulon_language: str
    stt_language: str
    stt_model: str
    tts_language: str
    tts_model: str


def _normalized_sigulon_language(language: str | None) -> str:
    return (language or "").strip().replace("_", "-").lower()


def resolve_cartesia_language(language: str | None) -> str:
    """Map one stored Sigulon language code to Cartesia's exact 2-letter base code.

    Raises a configuration error when an unsupported bundle language reaches the runtime.
    """
    normalized = _normalized_sigulon_language(language)
    resolved = SIGULON_TO_CARTESIA_LANGUAGE.get(normalized)
    if resolved is None:
        # Check if bare 2-letter code is available
        base = normalized.split("-")[0] if "-" in normalized else normalized
        resolved = SIGULON_TO_CARTESIA_LANGUAGE.get(base)
    if resolved is None:
        supported = ", ".join(("en-IN", "hi-IN", "ta-IN", "te-IN"))
        raise CartesiaLanguageConfigurationError(
            f"Unsupported Sigulon language {language!r} for Cartesia. "
            f"Supported bundle languages: {supported}."
        )
    return resolved


def resolve_cartesia_stt_language(
    language: str | None,
    model: str | None = None,
) -> tuple[str, str]:
    """Resolve provider language code and effective STT model.

    Returns:
        tuple of (provider_language, effective_model)

    Raises:
        CartesiaLanguageConfigurationError if model/language combination is invalid.
    """
    provider_lang = resolve_cartesia_language(language)
    sig_lang = (language or "").strip()

    # Determine effective model
    eff_model = model or (
        CARTESIA_STT_ENGLISH_MODEL if provider_lang == "en" else CARTESIA_STT_MULTILINGUAL_MODEL
    )
    # Sanitize known foreign or legacy models
    if eff_model not in CARTESIA_STT_ALLOWED_MODELS:
        eff_model = (
            CARTESIA_STT_ENGLISH_MODEL if provider_lang == "en" else CARTESIA_STT_MULTILINGUAL_MODEL
        )

    # Validate model-language compatibility
    if eff_model == CARTESIA_STT_ENGLISH_MODEL and provider_lang != "en":
        raise CartesiaLanguageConfigurationError(
            f"Cartesia STT model {eff_model!r} does not support Sigulon language {sig_lang!r} "
            f"(resolved provider language: {provider_lang!r}). ink-2 is English-only. "
            f"Use {CARTESIA_STT_MULTILINGUAL_MODEL!r} instead."
        )

    if eff_model == CARTESIA_STT_MULTILINGUAL_MODEL:
        if provider_lang not in CARTESIA_INK_WHISPER_SUPPORTED_LANGUAGES:
            raise CartesiaLanguageConfigurationError(
                f"Cartesia STT model {eff_model!r} does not support Sigulon language {sig_lang!r} "
                f"(resolved provider language: {provider_lang!r})."
            )

    log.info(
        "[cartesia-stt] model=%s sigulon_language=%s provider_language=%s",
        eff_model,
        sig_lang,
        provider_lang,
    )
    return provider_lang, eff_model


def resolve_cartesia_tts_language(
    language: str | None,
    model: str | None = None,
) -> tuple[str, str]:
    """Resolve provider language code and effective TTS model.

    Returns:
        tuple of (provider_language, effective_model)

    Raises:
        CartesiaLanguageConfigurationError if model/language combination is invalid.
    """
    provider_lang = resolve_cartesia_language(language)
    sig_lang = (language or "").strip()

    # Normalize sunsetted or legacy models to sonic-3
    eff_model = (model or "").strip()
    if not eff_model or eff_model in ("sonic", "sonic-english", "sonic-multilingual", "sonic-preview"):
        eff_model = CARTESIA_TTS_DEFAULT_MODEL

    if eff_model not in CARTESIA_TTS_ALLOWED_MODELS:
        raise CartesiaLanguageConfigurationError(
            f"Cartesia TTS model {eff_model!r} is not supported. "
            f"Supported models: {', '.join(sorted(CARTESIA_TTS_ALLOWED_MODELS))}."
        )

    if provider_lang not in CARTESIA_TTS_SUPPORTED_LANGUAGES:
        raise CartesiaLanguageConfigurationError(
            f"Cartesia TTS model {eff_model!r} does not support Sigulon language {sig_lang!r} "
            f"(resolved provider language: {provider_lang!r})."
        )

    log.info(
        "[cartesia-tts] model=%s sigulon_language=%s provider_language=%s",
        eff_model,
        sig_lang,
        provider_lang,
    )
    return provider_lang, eff_model


def validate_cartesia_speech_config(
    *,
    language: str | None,
    stt_model: str | None,
    tts_model: str | None,
) -> CartesiaLanguageConfig:
    """Resolve and validate the Cartesia STT/TTS model-language pair for a call."""
    stt_lang, effective_stt_model = resolve_cartesia_stt_language(language, stt_model)
    tts_lang, effective_tts_model = resolve_cartesia_tts_language(language, tts_model)

    return CartesiaLanguageConfig(
        sigulon_language=(language or "").strip(),
        stt_language=stt_lang,
        stt_model=effective_stt_model,
        tts_language=tts_lang,
        tts_model=effective_tts_model,
    )


# Constant backward-compatible alias
CARTESIA_TTS_MODEL = CARTESIA_TTS_DEFAULT_MODEL

__all__ = [
    "CARTESIA_INK_2_SUPPORTED_LANGUAGES",
    "CARTESIA_INK_WHISPER_SUPPORTED_LANGUAGES",
    "CARTESIA_STT_ALLOWED_MODELS",
    "CARTESIA_STT_ENGLISH_MODEL",
    "CARTESIA_STT_MULTILINGUAL_MODEL",
    "CARTESIA_TTS_ALLOWED_MODELS",
    "CARTESIA_TTS_DEFAULT_MODEL",
    "CARTESIA_TTS_MODEL",
    "CARTESIA_TTS_SUPPORTED_LANGUAGES",
    "CartesiaLanguageConfig",
    "CartesiaLanguageConfigurationError",
    "SIGULON_TO_CARTESIA_LANGUAGE",
    "resolve_cartesia_language",
    "resolve_cartesia_stt_language",
    "resolve_cartesia_tts_language",
    "validate_cartesia_speech_config",
]
