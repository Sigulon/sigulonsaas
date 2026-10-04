"""Billing calls from the LiveKit worker to the web control plane.

- Session start: reserve estimated minutes
  (POST /api/internal/credits/reserve {call_id}) — idempotent per call.
- Session end: settle actual duration
  (POST /api/internal/credits/settle {call_id, duration_seconds}).
- Zero-balance: honor config.on_no_balance ("message" | "forward_number").

Best-effort by design: unconfigured base/secret, timeouts, and 5xx all
resolve to False. The LiveKit room_finished webhook's settle reconciles
missing reservations (usage-only settle), so a missed ping never corrupts
balances.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Literal

log = logging.getLogger("voice-runtime.billing")

OnNoBalance = Literal["message", "forward_number"]


def reserve_url(public_web_base: str) -> str:
    return f"{public_web_base.rstrip('/')}/api/internal/credits/reserve"


def settle_url(public_web_base: str) -> str:
    return f"{public_web_base.rstrip('/')}/api/internal/credits/settle"


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


async def notify_credits_settle(
    call_id: str,
    duration_seconds: float,
    *,
    web_base: str | None = None,
    secret: str | None = None,
    timeout_seconds: float = 5.0,
) -> bool:
    """POST actual duration so the control plane settles the reservation."""
    base = (web_base if web_base is not None
            else os.getenv("INTERNAL_API_BASE_URL", "")).rstrip("/")
    token = secret if secret is not None else os.getenv("INTERNAL_API_SECRET", "")
    if not base or not token:
        return False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                settle_url(base),
                headers={"Authorization": f"Bearer {token}"},
                json={"call_id": call_id, "duration_seconds": duration_seconds},
            )
        if response.status_code == 404:
            log.warning("settle ping: web has no call %s", call_id)
            return False
        if response.status_code >= 400:
            log.warning("settle ping failed for call %s: HTTP %d",
                        call_id, response.status_code)
            return False
        body: Any = response.json()
        return bool(body.get("ok", True))
    except Exception as exc:  # noqa: BLE001 - billing must never break cleanup
        log.warning("settle ping failed for call %s: %s", call_id, exc)
        return False


def zero_balance_action(on_no_balance: str | None, forward_number: str | None) -> dict[str, Any]:
    """Resolve the zero-balance branch per agent config.

    - "forward_number" + configured number -> SIP forward instruction.
    - anything else -> play the insufficient-balance message and end.
    """
    mode: str = (on_no_balance or "message").strip() or "message"
    if mode not in ("message", "forward_number"):
        mode = "message"
    if mode == "forward_number" and (forward_number or "").strip():
        return {"action": "forward", "to": forward_number.strip()}
    return {
        "action": "message",
        "text": (
            "Sorry, this line is out of calling credits. "
            "Please ask the business owner to top up, then call again."
        ),
    }


__all__ = [
    "notify_credits_reserve",
    "notify_credits_settle",
    "reserve_url",
    "settle_url",
    "zero_balance_action",
]
