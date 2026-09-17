"""Billing ping from the runtime to the web control plane.

Inbound legs have no web answer hook (Plivo streams straight into the WS),
so the runtime notifies the web service once per call to hold the ANSWERED
estimate. The web endpoint is idempotent per call (`reserve:{call_id}`), so
this ping and the outbound-answer webhook's reserve converge harmlessly —
whichever lands first holds, the other is a no-op.

Best-effort by design: unconfigured base/secret, timeouts, and 5xx all
resolve to False. The status webhook's settle reconciles missing
reservations (usage-only settle), so a missed ping never corrupts balances.
"""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("voice-runtime.billing")


def reserve_url(public_web_base: str) -> str:
    return f"{public_web_base.rstrip('/')}/api/internal/credits/reserve"


async def notify_credits_reserve(
    call_id: str,
    *,
    web_base: str | None = None,
    secret: str | None = None,
    timeout_seconds: float = 3.0,
) -> bool:
    """POST the reserve ping. Returns True when the web service held credits."""
    base = (web_base if web_base is not None
            else os.getenv("INTERNAL_API_BASE_URL", "")).rstrip("/")
    token = secret if secret is not None else os.getenv("INTERNAL_API_SECRET", "")
    if not base or not token:
        return False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                reserve_url(base),
                headers={"Authorization": f"Bearer {token}"},
                json={"call_id": call_id},
            )
        if response.status_code == 404:
            log.warning("reserve ping: web has no call %s (direct-dial?)", call_id)
            return False
        if response.status_code >= 400:
            log.warning("reserve ping failed for call %s: HTTP %d",
                        call_id, response.status_code)
            return False
        body: Any = response.json()
        if body.get("insufficient"):
            log.warning("reserve ping: org balance insufficient (call=%s)", call_id)
        return bool(body.get("ok"))
    except Exception as exc:  # noqa: BLE001 - billing must never break audio
        log.warning("reserve ping failed for call %s: %s", call_id, exc)
        return False


__all__ = ["notify_credits_reserve", "reserve_url"]
