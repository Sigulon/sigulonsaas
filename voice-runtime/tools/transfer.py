"""``transfer_call``: cold-transfer the caller to a human.

The destination is the agent's configured `settings.transfer_number` — never
caller-supplied (an open transfer target would be a toll-fraud hole). The
leg moves via Plivo's REST Transfer to XML served by the web
transfer-target endpoint, which dials exactly that configured number.
Without a configured number or a live provider leg, the tool says so and
the model offers a callback instead.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import quote

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from tools.common import ctx_ids, load_agent, load_call

log = logging.getLogger("voice-runtime.tools.transfer")


def _mask(number: str) -> str:
    digits = "".join(ch for ch in number if ch.isdigit())
    return f"…{digits[-4:]}" if len(digits) >= 4 else "the team"


async def transfer_call_handler(params: FunctionCallParams) -> None:
    reason = str(params.arguments.get("reason", "")).strip()
    call_id, tenant_id, agent_id = ctx_ids(params)

    try:
        agent = await load_agent(tenant_id, agent_id)
        settings = ((agent or {}).get("settings") or {})
        if not isinstance(settings, dict):
            settings = {}
        transfer_number = str(
            settings.get("transferNumber") or settings.get("transfer_number") or ""
        ).strip()
        if not transfer_number:
            await params.result_callback({
                "status": "error",
                "error": (
                    "No transfer destination is configured for this line. "
                    "Offer the caller a callback instead."
                ),
            })
            return

        call = await load_call(call_id, tenant_id) if call_id else None
        provider_call_id = (call or {}).get("provider_call_id")
        if not provider_call_id:
            await params.result_callback({
                "status": "error",
                "error": (
                    "Transfer isn't available on this call. "
                    "Offer the caller a callback instead."
                ),
            })
            return

        from providers.telephony import PlivoTelephonyClient

        web_base = os.getenv("PUBLIC_WEB_URL", "").rstrip("/")
        if not web_base:
            await params.result_callback({
                "status": "error",
                "error": "Transfer service is not configured. Offer a callback instead.",
            })
            return

        aleg_url = (
            f"{web_base}/api/webhooks/plivo/transfer-target"
            f"?call_id={quote(call_id, safe='')}"
        )
        await PlivoTelephonyClient().transfer_call(str(provider_call_id), aleg_url)
    except Exception as exc:  # noqa: BLE001
        log.exception("transfer_call failed")
        await params.result_callback({"status": "error", "error": str(exc)})
        return

    log.info("Call %s transferred (%s)", call_id,
             (f"reason={reason}" if reason else "no reason given"))
    await params.result_callback({
        "status": "transferring",
        "to": _mask(transfer_number),
        "confirmation": (
            "Connecting you to a team member now — please hold the line."
        ),
    })


TRANSFER_CALL_SCHEMA = FunctionSchema(
    name="transfer_call",
    description=(
        "Transfer the caller to a human team member. Call this when the "
        "caller explicitly asks for a human/agent, or the request is beyond "
        "what you can handle."
    ),
    properties={
        "reason": {
            "type": "string",
            "description": "Why the caller needs a human (optional).",
        },
    },
    required=[],
    handler=transfer_call_handler,
)
