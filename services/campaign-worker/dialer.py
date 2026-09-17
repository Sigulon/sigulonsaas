"""Plivo outbound dial (REST `Call/` API) with bounded retry.

The worker is the only process that dials. Answer/hangup callbacks land on
the web service (`/api/webhooks/plivo/outbound-answer`, `/plivo/status`),
which binds the provider leg to the `calls` row this dial creates.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional
from urllib.parse import quote

import httpx

log = logging.getLogger("campaign-worker.dialer")

PLIVO_CALL_ENDPOINT = "https://api.plivo.com/v1/Account/{auth_id}/Call/"

TRANSIENT_MARKERS = (
    "timeout", "timed out", "connection reset", "connection aborted",
    "connecterror", "network", "unreachable", "econn", "socket",
    "service unavailable", "bad gateway", "gateway timeout",
    "too many requests", "rate limit", "429", "500", "502", "503", "504",
)


def is_transient(exc: BaseException) -> bool:
    haystack = f"{type(exc).__name__} {exc}".lower()
    return any(marker in haystack for marker in TRANSIENT_MARKERS)


def answer_url_for_call(public_web_url: str, call_id: str) -> str:
    base = public_web_url.rstrip("/")
    return f"{base}/api/webhooks/plivo/outbound-answer?call_id={quote(call_id, safe='')}"


def hangup_url(public_web_url: str, call_id: Optional[str] = None) -> str:
    """Status callback URL, correlated to the local row before Plivo answers.

    A no-answer/busy leg never reaches the answer callback, so CallUUID is
    not yet persisted. Carrying our opaque call id in this signed callback
    lets the web service bind that terminal event to the queued call.
    """
    url = f"{public_web_url.rstrip('/')}/api/webhooks/plivo/status"
    if call_id:
        url += f"?call_id={quote(call_id, safe='')}"
    return url


def dial(
    *,
    auth_id: str,
    auth_token: str,
    from_number: str,
    to_number: str,
    answer_url: str,
    hangup_url: str,
    timeout_seconds: int = 15,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """Dial one call. Returns Plivo's JSON (``request_uuid`` …).

    Retries transient transport/5xx failures with exponential backoff;
    permanent errors (auth, validation) raise immediately.
    """
    url = PLIVO_CALL_ENDPOINT.format(auth_id=auth_id)
    payload = {
        "from": from_number,
        "to": to_number,
        "answer_url": answer_url,
        "answer_method": "POST",
        "hangup_url": hangup_url,
        "hangup_method": "POST",
    }
    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(url, auth=(auth_id, auth_token), json=payload)
            if response.status_code >= 500 or response.status_code == 429:
                raise RuntimeError(f"Plivo dial HTTP {response.status_code}")
            if response.status_code >= 400:
                log.error(
                    "Plivo dial refused %s -> %s: HTTP %d %s",
                    from_number, to_number,
                    response.status_code, response.text[:300],
                )
                response.raise_for_status()
            data = response.json()
            log.info(
                "Plivo dial accepted %s -> %s (request_uuid=%s)",
                from_number, to_number, data.get("request_uuid"),
            )
            return data
        except Exception as exc:  # noqa: BLE001 - retry policy is the point
            last_error = exc
            if not is_transient(exc) or attempt >= max_attempts:
                log.error(
                    "Plivo dial failed %s -> %s (attempt %d/%d): %s",
                    from_number, to_number, attempt, max_attempts, exc,
                )
                raise
            delay = 0.5 * (2 ** (attempt - 1))
            log.warning(
                "Plivo dial transient failure (attempt %d/%d): %s — retrying in %.1fs",
                attempt, max_attempts, exc, delay,
            )
            time.sleep(delay)
    raise last_error or RuntimeError("Plivo dial failed")


__all__ = [
    "answer_url_for_call",
    "dial",
    "hangup_url",
    "is_transient",
]
