"""LiveKit provider descriptors behind one import surface.

The worker builds AgentSession pieces from here / voice_stack — never from a vendor SDK
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
    LLM_MODEL,
    PRIMARY_LLM_MODEL,
    SUPPORTED_LLM_PROVIDERS,
    build_llm,
)
from providers.stt import (
    PRIMARY_STT_MODEL,
    STT_MODEL,
    SUPPORTED_STT_PROVIDERS,
    build_stt,
    default_stt_model,
)
from providers.tts import (
    PRIMARY_TTS_MODEL,
    SUPPORTED_TTS_PROVIDERS,
    TTS_MODEL,
    build_tts,
    clamp_voice_speed,
)

__all__ = [
    "LLM_MODEL",
    "PRIMARY_LLM_MODEL",
    "PRIMARY_STT_MODEL",
    "PRIMARY_TTS_MODEL",
    "ProviderError",
    "STT_MODEL",
    "SUPPORTED_LLM_PROVIDERS",
    "SUPPORTED_STT_PROVIDERS",
    "SUPPORTED_TTS_PROVIDERS",
    "TTS_MODEL",
    "build_llm",
    "build_stt",
    "build_tts",
    "classify_provider_error",
    "clamp_voice_speed",
    "default_stt_model",
    "describe_recovery",
    "with_provider_retry",
]
