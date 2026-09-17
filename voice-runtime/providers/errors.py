"""Per-provider failure classification + bounded retry.

Pipeline policy (one place, so every provider behaves the same way):

* **STT** — Pipecat services own their WebSocket reconnects. Our job is to
  pick the right vendor per language (see :mod:`providers.stt`) and to fail
  fast on auth/config errors instead of flapping.
* **LLM** — transient transport errors (timeouts, 5xx, connection resets)
  are retried with exponential backoff; auth/validation errors fail fast.
* **TTS** — never silently substitute a different voice/vendor mid-call;
  transient errors get one retry, then the call ends loudly.
* **Telephony / persistence** — REST + MongoDB writes use the same retry
  helper so webhooks and ``finalize_call()`` survive redelivery bursts.

Anything decorated here never masks ``asyncio.CancelledError``.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Literal, TypeVar

log = logging.getLogger("voice-runtime.providers.errors")

ErrorCategory = Literal["transient", "permanent"]

T = TypeVar("T")

# Substrings that (case-insensitively) mark an error as retryable transport
# noise rather than a config/auth problem. Checked against both the exception
# class name and its message without importing every client SDK here.
# without importing every SDK here.
_TRANSIENT_HINTS = (
    "timeout",
    "timed out",
    "temporarily",
    "try again",
    "connection reset",
    "connection aborted",
    "connection closed",
    "connecterror",
    "network",
    "unreachable",
    "dns",
    "econn",
    "socket",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "too many requests",
    "rate limit",
    "rate-limited",
    "429",
    "500",
    "502",
    "503",
    "504",
)

_PERMANENT_HINTS = (
    "unauthorized",
    "forbidden",
    "invalid api key",
    "invalid_api_key",
    "api key",
    "apikey",
    "authentication",
    "permission denied",
    "not found",
    "404",
    "400",
    "422",
    "validation",
    "unsupported",
    "unknown stt provider",
    "unknown llm provider",
    "unknown tts provider",
)


class ProviderError(RuntimeError):
    """A provider failure with a retry policy attached.

    Attributes:
        provider: Vendor name, e.g. ``"cartesia"``, ``"openrouter"``.
        category: ``"transient"`` (safe to retry) or ``"permanent"``.
        original: The underlying exception, if any.
    """

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        category: ErrorCategory = "transient",
        original: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.category = category
        self.original = original


def classify_provider_error(exc: BaseException, provider: str) -> ProviderError:
    """Classify an arbitrary exception as transient or permanent.

    Never raises — unknown errors default to transient (a single bounded
    retry is cheaper than dropping a live call on a hiccup), except inside
    pipeline *setup* where :func:`with_provider_retry` is not used and the
    caller decides.
    """
    if isinstance(exc, ProviderError):
        return exc
    haystack = f"{type(exc).__name__} {exc}".lower()
    if any(hint in haystack for hint in _PERMANENT_HINTS):
        return ProviderError(str(exc), provider=provider, category="permanent", original=exc)
    # Unknown -> transient (bounded retry caps the blast radius).
    return ProviderError(str(exc), provider=provider, category="transient", original=exc)


async def with_provider_retry(
    fn: Callable[[], Awaitable[T]],
    *,
    provider: str,
    max_attempts: int = 3,
    base_delay_seconds: float = 0.5,
    operation: str = "operation",
) -> T:
    """Run ``fn`` with exponential backoff on transient provider errors.

    Permanent errors (auth, validation, unknown-vendor) raise immediately.
    After ``max_attempts`` transient failures the last error raises as a
    :class:`ProviderError`. ``asyncio.CancelledError`` is never swallowed.
    """
    last_error: ProviderError | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - classification is the point
            classified = classify_provider_error(exc, provider)
            last_error = classified
            if classified.category == "permanent" or attempt >= max_attempts:
                log.error(
                    "%s failed (provider=%s attempt=%d/%d category=%s): %s",
                    operation, provider, attempt, max_attempts,
                    classified.category, classified,
                )
                raise classified from exc
            delay = base_delay_seconds * (2 ** (attempt - 1))
            log.warning(
                "%s transient failure (provider=%s attempt=%d/%d): %s — retrying in %.1fs",
                operation, provider, attempt, max_attempts, classified, delay,
            )
            await asyncio.sleep(delay)
    raise last_error or ProviderError(  # pragma: no cover - loop always sets it
        f"{operation} failed", provider=provider, category="transient"
    )


def describe_recovery(provider: str) -> str:
    """Human-readable recovery policy for a provider (logs + docs)."""
    policies = {
        "cartesia-stt": "Pipecat WS auto-reconnect; finalize-flush on VAD stop",
        "openrouter": "transient 5xx/timeout retried x3 with backoff; auth fails fast",
        "cartesia-tts": "one transient retry; never substitute another voice mid-call",
        "plivo": "REST hangup/dial retried x3 with backoff; answer XML is a pure function",
        "mongodb": "session/finalize writes retried x3; Redis finalized-marker keeps it idempotent",
    }
    return policies.get(provider, "transient retried x3 with backoff; permanent fails fast")


__all__ = [
    "ErrorCategory",
    "ProviderError",
    "classify_provider_error",
    "describe_recovery",
    "with_provider_retry",
]
