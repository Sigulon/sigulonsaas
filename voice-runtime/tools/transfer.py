"""``transfer_call``: cold-transfer the caller to a human (LiveKit SIP).

The destination is the agent's configured `settings.transferNumber` — never
caller-supplied (an open transfer target would be a toll-fraud hole). The
worker returns a transfer instruction; the session layer performs the SIP
transfer via the LiveKit API / control plane. Without a configured number
the tool says so and the model offers a callback instead.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from tools.common import ctx_ids, load_agent

log = logging.getLogger("voice-runtime.tools.transfer")


def _mask(number: str) -> str:
    digits = "".join(ch for ch in number if ch.isdigit())
    return f"…{digits[-4:]}" if len(digits) >= 4 else "the team"


async def transfer_call_impl(
    call_id: str, tenant_id: str, agent_id: str, *, reason: str = ""
) -> dict[str, Any]:
    reason = (reason or "").strip()
    try:
        agent = await load_agent(tenant_id, agent_id)
        settings = ((agent or {}).get("settings") or {})
        if not isinstance(settings, dict):
            settings = {}
        transfer_number = str(
            settings.get("transferNumber") or settings.get("transfer_number") or ""
        ).strip()
        if not transfer_number:
            return {
                "status": "error",
                "error": (
                    "No transfer destination is configured for this line. "
                    "Offer the caller a callback instead."
                ),
            }
        if not call_id:
            return {
                "status": "error",
                "error": "Transfer isn't available on this call. Offer the caller a callback instead.",
            }
    except Exception as exc:  # noqa: BLE001
        log.exception("transfer_call failed")
        return {"status": "error", "error": str(exc)}

    log.info("Call %s transfer requested (%s -> %s)", call_id,
             (f"reason={reason}" if reason else "no reason given"), _mask(transfer_number))
    return {
        "status": "transferring",
        "to": _mask(transfer_number),
        "transfer_number": transfer_number,
        "call_id": call_id,
        "confirmation": "Connecting you to a team member now — please hold the line.",
    }


try:
    from livekit.agents import RunContext, function_tool

    @function_tool()
    async def transfer_call(
        context: RunContext,
        reason: Annotated[str, "Why the caller needs a human (optional)."] = "",
    ) -> dict[str, Any]:
        """Transfer the caller to a human team member. Call this when the caller explicitly asks for a human/agent, or the request is beyond what you can handle."""
        call_id, tenant_id, agent_id = ctx_ids(context)
        return await transfer_call_impl(call_id, tenant_id, agent_id, reason=reason)
except ImportError:  # pragma: no cover
    async def transfer_call(context: Any, **kwargs: Any) -> dict[str, Any]:  # type: ignore[no-redef]
        """Transfer the caller to a human team member. Call this when the caller explicitly asks for a human/agent, or the request is beyond what you can handle."""
        call_id, tenant_id, agent_id = ctx_ids(context)
        return await transfer_call_impl(call_id, tenant_id, agent_id, **kwargs)


async def transfer_call_handler(params: Any) -> dict[str, Any]:
    args = getattr(params, "arguments", {}) or {}
    call_id, tenant_id, agent_id = ctx_ids(params)
    result = await transfer_call_impl(
        call_id, tenant_id, agent_id, reason=str(args.get("reason", ""))
    )
    cb = getattr(params, "result_callback", None)
    if callable(cb):
        await cb(result)
    return result


TRANSFER_CALL_SPEC = {
    "name": "transfer_call",
    "description": (
        "Transfer the caller to a human team member. Call this when the "
        "caller explicitly asks for a human/agent, or the request is beyond "
        "what you can handle."
    ),
    "properties": {
        "reason": {"type": "string", "description": "Why the caller needs a human (optional)."},
    },
    "required": [],
}

TRANSFER_CALL_SCHEMA = TRANSFER_CALL_SPEC
