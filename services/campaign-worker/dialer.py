"""LiveKit outbound dial (room + AgentDispatch + SIP participant).

The worker is the only process that dials. The voice-runtime worker
(`sigulon-voice-agent`) picks up the dispatch with job metadata
``{orgId, agentId, direction: "outbound"}`` and joins the room; the SIP
participant bridges the callee via the org's outbound trunk (Plivo
termination behind it).

DNC, consent, pacing, retries, and outcome writing live in worker.py —
this module only places the LiveKit calls with bounded retry.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

log = logging.getLogger("campaign-worker.dialer")

AGENT_NAME_DEFAULT = "sigulon-voice-agent"

TRANSIENT_MARKERS = (
    "timeout", "timed out", "connection reset", "connection aborted",
    "connecterror", "network", "unreachable", "econn", "socket",
    "service unavailable", "bad gateway", "gateway timeout",
    "too many requests", "rate limit", "429", "500", "502", "503", "504",
)


def is_transient(exc: BaseException) -> bool:
    haystack = f"{type(exc).__name__} {exc}".lower()
    return any(marker in haystack for marker in TRANSIENT_MARKERS)


def room_name_for_call(call_id: str) -> str:
    return f"sigulon-call-{call_id}"


def dispatch_metadata(org_id: str, agent_id: str, call_id: str) -> str:
    return json.dumps({
        "orgId": org_id,
        "agentId": agent_id,
        "callId": call_id,
        "direction": "outbound",
        "room": room_name_for_call(call_id),
    })


def _livekit_api(livekit_url: str, api_key: str, api_secret: str) -> Any:
    try:
        from livekit import api as lkapi
    except ImportError as exc:
        raise RuntimeError("The 'livekit-api' package is required.") from exc
    return lkapi.LiveKitAPI(livekit_url, api_key, api_secret)


async def _adial_once(
    *,
    lk: Any,
    agent_name: str,
    room: str,
    metadata: str,
    sip_trunk_id: str,
    sip_call_to: str,
    participant_identity: str,
    sip_from_number: str,
    wait_until_answered: bool = True,
) -> dict[str, Any]:
    from livekit import api as lkapi

    dispatch = await lk.agent_dispatch.create_dispatch(
        lkapi.CreateAgentDispatchRequest(
            agent_name=agent_name,
            room=room,
            metadata=metadata,
        )
    )
    participant = await lk.sip.create_sip_participant(
        lkapi.CreateSIPParticipantRequest(
            room_name=room,
            sip_trunk_id=sip_trunk_id,
            sip_call_to=sip_call_to,
            participant_identity=participant_identity,
            participant_name=participant_identity,
            sip_number=sip_from_number,
            wait_until_answered=wait_until_answered,
        )
    )
    dispatch_id = getattr(dispatch, "dispatch_id", getattr(dispatch, "id", ""))
    participant_id = getattr(participant, "participant_id", getattr(participant, "participant_identity", ""))
    return {"room": room, "dispatch_id": str(dispatch_id or ""), "participant_id": str(participant_id or "")}


def dial(
    *,
    room: str = "",
    call_id: str = "",
    org_id: str = "",
    agent_id: str = "",
    agent_name: str = AGENT_NAME_DEFAULT,
    metadata: str = "",
    sip_trunk_id: str = "",
    sip_call_to: str = "",
    participant_identity: str = "",
    sip_from_number: str = "",
    livekit_url: str = "",
    api_key: str = "",
    api_secret: str = "",
    timeout_seconds: int = 15,
    max_attempts: int = 3,
    # Deprecated Plivo-era kwargs (kept so old call sites fail loudly, not silently).
    auth_id: str = "",
    auth_token: str = "",
    from_number: str = "",
    to_number: str = "",
    answer_url: str = "",
    hangup_url: str = "",
) -> dict[str, Any]:
    """Place one outbound call via LiveKit. Returns ``{room, dispatch_id, ...}``.

    Retries transient transport/5xx failures with exponential backoff;
    permanent errors (auth, validation) raise immediately.
    ``sip_from_number`` (caller ID) must be a number owned by the org.
    """
    if auth_id or auth_token or answer_url or hangup_url:
        raise ValueError("Plivo REST dialing was removed — use LiveKit room/dispatch/SIP participant.")
    room = room or (room_name_for_call(call_id) if call_id else "")
    metadata = metadata or (dispatch_metadata(org_id, agent_id, call_id) if (org_id and agent_id and call_id) else "")
    sip_call_to = sip_call_to or to_number
    participant_identity = participant_identity or sip_call_to
    sip_from_number = sip_from_number or from_number
    if not room or not sip_trunk_id or not sip_call_to or not sip_from_number:
        raise ValueError("dial() requires room, sip_trunk_id, sip_call_to, and sip_from_number (org-owned caller ID).")
    if not livekit_url or not api_key or not api_secret:
        raise ValueError("dial() requires livekit_url, api_key, and api_secret.")

    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            import asyncio

            lk = _livekit_api(livekit_url, api_key, api_secret)
            try:
                result = asyncio.run(
                    asyncio.wait_for(
                        _adial_once(
                            lk=lk,
                            agent_name=agent_name or AGENT_NAME_DEFAULT,
                            room=room,
                            metadata=metadata,
                            sip_trunk_id=sip_trunk_id,
                            sip_call_to=sip_call_to,
                            participant_identity=participant_identity,
                            sip_from_number=sip_from_number,
                        ),
                        timeout=timeout_seconds,
                    )
                )
            finally:
                try:
                    aclose = getattr(lk, "aclose", None)
                    if callable(aclose):
                        asyncio.run(aclose())
                except Exception:  # noqa: BLE001 - cleanup only
                    pass
            log.info("LiveKit dial accepted room=%s to=%s dispatch=%s", room, sip_call_to, result.get("dispatch_id"))
            return result
        except Exception as exc:  # noqa: BLE001 - retry policy is the point
            last_error = exc
            if not is_transient(exc) or attempt >= max_attempts:
                log.error("LiveKit dial failed room=%s to=%s (attempt %d/%d): %s",
                          room, sip_call_to, attempt, max_attempts, exc)
                raise
            delay = 0.5 * (2 ** (attempt - 1))
            log.warning("LiveKit dial transient failure (attempt %d/%d): %s — retrying in %.1fs",
                        attempt, max_attempts, exc, delay)
            time.sleep(delay)
    raise last_error or RuntimeError("LiveKit dial failed")


# Deprecated Plivo-era URL helpers — kept as explicit errors so any stale
# caller fails loudly instead of dialing the removed path.
def answer_url_for_call(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("answer_url_for_call was removed — outbound dial uses LiveKit dispatch, not Plivo answer URLs.")


def hangup_url(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("hangup_url was removed — call state comes from LiveKit webhooks, not Plivo status callbacks.")


__all__ = [
    "dial",
    "dispatch_metadata",
    "is_transient",
    "room_name_for_call",
]
