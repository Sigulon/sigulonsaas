"""LiveKit provider descriptors behind one import surface.

The worker builds AgentSession pieces from here — never from a vendor SDK
directly in agent.py — so swapping a model stays a descriptor change, not a
worker rewrite. No audio plumbing lives here; LiveKit Cloud carries media.
"""

from providers.errors import (
    ProviderError,
    classify_provider_error,
    describe_recovery,
    with_provider_retry,
)
from providers.llm import (
    OPENROUTER_FALLBACK_MODEL,
    SUPPORTED_LLM_PROVIDERS,
    build_llm,
    default_openrouter_model,
)
from providers.stt import (
    SUPPORTED_STT_PROVIDERS,
    build_stt,
    default_stt_model,
)
from providers.tts import (
    SUPPORTED_TTS_PROVIDERS,
    build_tts,
    clamp_voice_speed,
)

__all__ = [
    "OPENROUTER_FALLBACK_MODEL",
    "ProviderError",
    "SUPPORTED_LLM_PROVIDERS",
    "SUPPORTED_STT_PROVIDERS",
    "SUPPORTED_TTS_PROVIDERS",
    "build_llm",
    "build_stt",
    "build_tts",
    "classify_provider_error",
    "clamp_voice_speed",
    "default_openrouter_model",
    "default_stt_model",
    "describe_recovery",
    "with_provider_retry",
]
