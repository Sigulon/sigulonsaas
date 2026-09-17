"""``create_lead``: org-scoped lightweight CRM capture into ``contacts``.

When a caller shows interest but doesn't book, the model captures the lead
instead of losing it: upsert on the org's normalized number when a phone is
known (notes appended, never overwritten), plain insert otherwise. The lead
lands in the org's contacts with `metadata.lead = true` for follow-up.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from tools.common import ctx_ids, get_database, object_id, run_db

log = logging.getLogger("voice-runtime.tools.leads")

_LEAD_SOURCE = "voice-lead"


def _digits(raw: str) -> str:
    return "".join(ch for ch in (raw or "") if ch.isdigit())


def _normalize(raw: str) -> str | None:
    """Same E.164 rules as the web (`src/lib/phone.ts`) and worker."""
    trimmed = (raw or "").strip()
    digits = _digits(trimmed)
    if not digits:
        return None
    if trimmed.startswith("+"):
        return f"+{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return None


async def create_lead_handler(params: FunctionCallParams) -> None:
    name = str(params.arguments.get("name", "")).strip()
    phone = str(params.arguments.get("phone", "")).strip()
    notes = str(params.arguments.get("notes", "")).strip()
    interest = str(params.arguments.get("interest", "")).strip()

    if not name and not phone:
        await params.result_callback({
            "status": "error",
            "error": "Need at least a name or a phone number to save the lead.",
        })
        return

    _, tenant_id, _ = ctx_ids(params)
    normalized = _normalize(phone) if phone else None

    if not normalized:
        await params.result_callback({
            "status": "error",
            "error": "A valid callback phone number is required to save a lead.",
        })
        return

    try:
        def _save():
            tenant_oid = object_id(tenant_id)
            if tenant_oid is None:
                raise RuntimeError("Invalid organization context.")

            contacts = get_database().contacts
            existing = contacts.find_one({
                "organizationId": tenant_oid,
                "normalizedPhone": normalized,
            })
            if existing:
                fields = dict(existing.get("customFields") or {})
                prior = str(fields.get("leadNotes") or "")
                combined = f"{prior}\n{notes}".strip() if prior else notes
                fields.update({"lead": True, "leadNotes": combined})
                if interest:
                    fields["leadInterest"] = interest
                contacts.update_one({"_id": existing["_id"]}, {"$set": {
                    "name": existing.get("name") or name,
                    "customFields": fields,
                    "updatedAt": datetime.now(timezone.utc),
                }})
                return {"id": str(existing["_id"]), "updated": True}

            now = datetime.now(timezone.utc)
            result = contacts.insert_one({
                "organizationId": tenant_oid,
                "name": name,
                "phone": phone or normalized,
                "normalizedPhone": normalized,
                "customFields": {
                    "lead": True,
                    "leadNotes": notes,
                    "leadInterest": interest,
                },
                "source": _LEAD_SOURCE,
                "status": "active",
                "tags": ["lead"],
                "doNotCall": False,
                "createdAt": now,
                "updatedAt": now,
            })
            return {"id": str(result.inserted_id), "updated": False}

        saved = await run_db(_save)
    except Exception as exc:  # noqa: BLE001
        log.exception("create_lead failed")
        await params.result_callback({"status": "error", "error": str(exc)})
        return

    log.info("Lead saved: org=%s lead=%s", tenant_id, (saved or {}).get("id"))
    await params.result_callback({
        "status": "saved",
        "lead_id": (saved or {}).get("id"),
        "confirmation": (
            f"Saved {name or 'the caller'}'s details — the team will follow up."
        ),
    })


CREATE_LEAD_SCHEMA = FunctionSchema(
    name="create_lead",
    description=(
        "Save an interested caller's details as a lead for follow-up. Call "
        "this when the caller shows interest but does not book, or asks to "
        "be called back."
    ),
    properties={
        "name": {
            "type": "string",
            "description": "The caller's name as they stated it.",
        },
        "phone": {
            "type": "string",
            "description": "Callback number, if given (any format).",
        },
        "notes": {
            "type": "string",
            "description": "What they want / context for the follow-up.",
        },
        "interest": {
            "type": "string",
            "description": "Short interest tag, e.g. 'pricing', 'demo'.",
        },
    },
    required=[],
    handler=create_lead_handler,
)
