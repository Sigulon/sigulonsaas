"""``pricing_lookup``: real pricing from the agent's own configuration.

Pricing lives on the agent row (`settings.pricing`: a list of
`{item, price}` plus optional `currency`/`notes`) because prices differ per
business line the agent serves. When unconfigured the tool says so honestly
instead of inventing numbers — the owner adds pricing to the agent's
settings and the next call quotes it.
"""

from __future__ import annotations

import logging
from typing import Any

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from tools.common import ctx_ids, load_agent

log = logging.getLogger("voice-runtime.tools.pricing")


async def pricing_lookup_handler(params: FunctionCallParams) -> None:
    want = str(params.arguments.get("item", "")).strip().lower()
    _, tenant_id, agent_id = ctx_ids(params)

    try:
        agent = await load_agent(tenant_id, agent_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("pricing agent lookup failed")
        await params.result_callback({"status": "error", "error": str(exc)})
        return

    settings = (agent or {}).get("settings") or {}
    if not isinstance(settings, dict):
        settings = {}
    configured_pricing = settings.get("pricing") or []
    if isinstance(configured_pricing, dict):
        items = [
            {"item": item, "price": price}
            for item, price in configured_pricing.items()
        ]
    elif isinstance(configured_pricing, list):
        items = configured_pricing
    else:
        items = []
    currency = str(settings.get("currency") or "INR")

    if not items:
        await params.result_callback({
            "status": "unconfigured",
            "items": [],
            "message": (
                "No pricing list is configured for this business yet. "
                "Take the caller's details and promise a callback with a quote."
            ),
        })
        return

    if want:
        items = [i for i in items
                 if isinstance(i, dict) and want in str(i.get("item", "")).lower()]

    await params.result_callback({
        "status": "ok",
        "currency": currency,
        "items": items,
        "message": "Quote exactly these configured prices — never invent discounts.",
    })


PRICING_LOOKUP_SCHEMA = FunctionSchema(
    name="pricing_lookup",
    description=(
        "Look up the business's configured prices. Call this when the caller "
        "asks about cost, fees, rates, or quotes."
    ),
    properties={
        "item": {
            "type": "string",
            "description": "Optional item/service to filter by, e.g. 'consultation'.",
        },
    },
    required=[],
    handler=pricing_lookup_handler,
)
