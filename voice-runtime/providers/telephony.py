"""Plivo telephony abstraction: answer XML + REST (hangup / dial).

The voice runtime itself never dials — the campaign worker (Phase 6) does.
Both sides share this module's contract:

* :meth:`PlivoTelephonyClient.answer_xml` — pure function the Next.js
  control plane mirrors to point the answered call at
  ``wss://<runtime>/voice-runtime/{call_id}``.
* :meth:`PlivoTelephonyClient.hangup_call` — best-effort REST hangup with
  bounded retry (transient 5xx/timeout retried, auth fails fast).
* :meth:`PlivoTelephonyClient.make_call` — outbound dial used by the
  campaign worker; kept here so REST auth/retry live in exactly one place.
"""

from __future__ import annotations

import logging
import os
import xml.sax.saxutils as saxutils
from typing import Any, Optional
from urllib.parse import quote

import httpx

from providers.errors import with_provider_retry

log = logging.getLogger("voice-runtime.providers.telephony")

PLIVO_API_BASE = "https://api.plivo.com/v1/Account"


def build_answer_xml(*, stream_url: str, status_callback_url: str | None = None) -> str:
    """Build the Plivo answer XML pointing the call at our WebSocket.

    Pure function — no network, trivially unit-testable. Both the Next.js
    inbound webhook (Phase 5) and this client agree on this shape.
    """
    stream = saxutils.escape(stream_url, {'"': "&quot;"})
    callback_attr = ""
    if status_callback_url:
        escaped_callback = saxutils.escape(status_callback_url, {'"': "&quot;"})
        callback_attr = f'\n           statusCallbackUrl="{escaped_callback}"'
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<Response>\n"
        '  <Stream bidirectional="true" keepCallAlive="true"\n'
        '          contentType="audio/x-mulaw;rate=8000"'
        f"{callback_attr}>\n"
        f"    {stream}\n"
        "  </Stream>\n"
        "</Response>"
    )


def stream_url_for_call(*, runtime_base_url: str, call_id: str) -> str:
    """WebSocket URL Plivo dials back on, e.g. ``wss://host/voice-runtime/<id>``."""
    base = runtime_base_url.rstrip("/")
    if base.startswith("https://"):
        base = "wss://" + base[len("https://"):]
    elif base.startswith("http://"):
        base = "ws://" + base[len("http://"):]
    return f"{base}/voice-runtime/{quote(call_id, safe='')}"


class PlivoTelephonyClient:
    """Thin async wrapper over Plivo's Call API with retry baked in."""

    def __init__(
        self,
        *,
        auth_id: str | None = None,
        auth_token: str | None = None,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.auth_id = auth_id or os.getenv("PLIVO_AUTH_ID", "")
        self.auth_token = auth_token or os.getenv("PLIVO_AUTH_TOKEN", "")
        self.timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.auth_id and self.auth_token)

    def _require_auth(self) -> tuple[str, str]:
        if not self.configured:
            raise RuntimeError(
                "PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN are not configured."
            )
        return self.auth_id, self.auth_token

    async def hangup_call(self, provider_call_id: str) -> bool:
        """Hang a live call up. Returns True on success/404 (already gone)."""
        auth_id, auth_token = self._require_auth()

        async def _do() -> bool:
            url = f"{PLIVO_API_BASE}/{auth_id}/Call/{quote(provider_call_id, safe='')}/"
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.delete(url, auth=(auth_id, auth_token))
            if response.status_code in (200, 201, 204, 404):
                log.info(
                    "Plivo call %s terminated (HTTP %d)",
                    provider_call_id, response.status_code,
                )
                return True
            log.error(
                "Plivo hangup failed for %s: HTTP %d %s",
                provider_call_id, response.status_code, response.text[:500],
            )
            response.raise_for_status()
            return False  # pragma: no cover - raise_for_status always raises here

        return await with_provider_retry(
            _do, provider="plivo", max_attempts=3, operation="plivo.hangup_call",
        )

    async def make_call(
        self,
        *,
        from_number: str,
        to_number: str,
        answer_url: str,
        hangup_url: str | None = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Dial an outbound call. Returns Plivo's JSON (``request_uuid`` ...)."""
        auth_id, auth_token = self._require_auth()
        payload: dict[str, Any] = {
            "from": from_number,
            "to": to_number,
            "answer_url": answer_url,
        }
        if hangup_url:
            payload["hangup_url"] = hangup_url
        if extra:
            payload.update(extra)

        async def _do() -> dict[str, Any]:
            url = f"{PLIVO_API_BASE}/{auth_id}/Call/"
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url, auth=(auth_id, auth_token), json=payload
                )
            if response.status_code >= 400:
                log.error(
                    "Plivo dial failed %s -> %s: HTTP %d %s",
                    from_number, to_number,
                    response.status_code, response.text[:500],
                )
                response.raise_for_status()
            data = response.json()
            log.info(
                "Plivo dial accepted %s -> %s (request_uuid=%s)",
                from_number, to_number, data.get("request_uuid"),
            )
            return data

        return await with_provider_retry(
            _do, provider="plivo", max_attempts=3, operation="plivo.make_call",
        )

    async def transfer_call(
        self, provider_call_id: str, aleg_url: str
    ) -> dict[str, Any]:
        """Cold-transfer the live caller leg to XML at ``aleg_url``.

        The target XML must come from our own server (the web
        transfer-target endpoint dials only the agent's configured
        `transfer_number` — callers can never steer transfers).
        """
        auth_id, auth_token = self._require_auth()

        async def _do() -> dict[str, Any]:
            url = (
                f"{PLIVO_API_BASE}/{auth_id}/Call/"
                f"{quote(provider_call_id, safe='')}/Transfer/"
            )
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    url,
                    auth=(auth_id, auth_token),
                    json={"legs": "aleg", "aleg_url": aleg_url, "aleg_method": "POST"},
                )
            if response.status_code >= 400:
                log.error(
                    "Plivo transfer failed for %s: HTTP %d %s",
                    provider_call_id, response.status_code, response.text[:500],
                )
                response.raise_for_status()
            data = response.json()
            log.info("Plivo transfer started for %s", provider_call_id)
            return data

        return await with_provider_retry(
            _do, provider="plivo", max_attempts=2, operation="plivo.transfer_call",
        )


__all__ = [
    "PLIVO_API_BASE",
    "PlivoTelephonyClient",
    "build_answer_xml",
    "stream_url_for_call",
]
