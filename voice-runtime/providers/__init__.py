"""Provider factories behind one import surface.

The pipeline imports from here — never from a vendor SDK directly — so
adding a vendor stays a factory branch, not a pipeline rewrite.
"""

from providers.errors import (
    ProviderError,
    classify_provider_error,
    describe_recovery,
    with_provider_retry,
)
from providers.llm import SUPPORTED_LLM_PROVIDERS, create_llm_service
from providers.stt import (
    SUPPORTED_STT_PROVIDERS,
    create_stt_service,
    default_stt_model,
)
from providers.telephony import (
    PlivoTelephonyClient,
    build_answer_xml,
    stream_url_for_call,
)
from providers.tts import (
    SUPPORTED_TTS_PROVIDERS,
    clamp_voice_speed,
    create_tts_service,
)

__all__ = [
    "ProviderError",
    "SUPPORTED_LLM_PROVIDERS",
    "SUPPORTED_STT_PROVIDERS",
    "SUPPORTED_TTS_PROVIDERS",
    "PlivoTelephonyClient",
    "build_answer_xml",
    "clamp_voice_speed",
    "classify_provider_error",
    "create_llm_service",
    "create_stt_service",
    "create_tts_service",
    "default_stt_model",
    "describe_recovery",
    "stream_url_for_call",
    "with_provider_retry",
]
