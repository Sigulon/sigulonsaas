"""``book_appointment``: real booking into ``appointments``.

Round-trip: the model calls it -> availability is re-checked against the
org's calendar (the model may have skipped the check) -> the row is
inserted org-scoped with the call/contact linkage -> the result goes back
to the model, which confirms aloud. Conflicts return `status: conflict`
with the overlapping rows so the model can offer alternatives.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from tools.common import (
    appointment_window,
    ctx_ids,
    get_database,
    load_call,
    object_id,
    org_appointments_on,
    overlaps,
    parse_datetime,
    run_db,
)

log = logging.getLogger("voice-runtime.tools.book_appointment")


async def book_appointment_handler(params: FunctionCallParams) -> None:
    customer_name = str(params.arguments.get("customer_name", "")).strip()
    preferred_time = str(params.arguments.get("preferred_time", "")).strip()
    notes = str(params.arguments.get("notes", "")).strip()
    try:
        duration_minutes = max(5, min(480, int(params.arguments.get("duration_minutes", 30))))
    except (TypeError, ValueError):
        duration_minutes = 30

    if not customer_name or not preferred_time:
        await params.result_callback({
            "status": "error",
            "error": "Both 'customer_name' and 'preferred_time' are required.",
        })
        return

    start = parse_datetime(preferred_time)
    if start is None:
        await params.result_callback({
            "status": "error",
            "error": (
                "I couldn't pin that time down — ask the caller for a date "
                "like 12 September and a time like 4pm, then try again."
            ),
        })
        return
    end = start + timedelta(minutes=duration_minutes)

    call_id, tenant_id, agent_id = ctx_ids(params)
    call = await load_call(call_id, tenant_id) if call_id else None
    contact_id = (call or {}).get("contact_id")

    try:
        day_start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        day_appts = await org_appointments_on(
            tenant_id, day_start, day_start + timedelta(days=1)
        )
        conflicts = []
        for appt in day_appts:
            a_start, a_end = appointment_window(appt)
            if overlaps(start, end, a_start, a_end):
                conflicts.append({
                    "title": appt.get("title"),
                    "start_time": a_start.isoformat(),
                })
        if conflicts:
            await params.result_callback({
                "status": "conflict",
                "conflicts": conflicts,
                "message": "That slot just got taken — offer the caller a nearby time.",
            })
            return

        def _insert():
            tenant_oid = object_id(tenant_id)
            if tenant_oid is None:
                raise RuntimeError("Invalid organization context.")

            row: dict[str, Any] = {
                "organizationId": tenant_oid,
                "title": f"Call with {customer_name}",
                "startTime": start,
                "endTime": end,
                "timezone": "UTC",
                "status": "scheduled",
                "notes": notes,
            }
            if agent_oid := object_id(agent_id):
                row["agentId"] = agent_oid
            if call_oid := object_id(call_id):
                row["callId"] = call_oid
            if contact_oid := object_id(contact_id):
                row["contactId"] = contact_oid
            result = get_database().appointments.insert_one(row)
            return {"id": str(result.inserted_id)}

        row = await run_db(_insert)
    except Exception as exc:  # noqa: BLE001 - tool errors go back to the LLM
        log.exception("book_appointment failed")
        await params.result_callback({"status": "error", "error": str(exc)})
        return

    log.info("Appointment booked: org=%s appt=%s start=%s", tenant_id,
             (row or {}).get("id"), start.isoformat())
    await params.result_callback({
        "status": "booked",
        "appointment_id": (row or {}).get("id"),
        "customer_name": customer_name,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "confirmation": (
            f"Appointment booked for {customer_name} at {start.isoformat()}."
        ),
    })


BOOK_APPOINTMENT_SCHEMA = FunctionSchema(
    name="book_appointment",
    description=(
        "Book an appointment for the customer. Call this when the caller "
        "agrees to a time or asks to schedule, reschedule, or confirm a visit."
    ),
    properties={
        "customer_name": {
            "type": "string",
            "description": "The customer's full name as they stated it.",
        },
        "preferred_time": {
            "type": "string",
            "description": (
                "Date/time, e.g. '2026-09-12 15:30' or '2026-09-12T15:30:00+05:30'."
            ),
        },
        "duration_minutes": {
            "type": "integer",
            "description": "Length in minutes (default 30).",
        },
        "notes": {
            "type": "string",
            "description": "Anything the business should know (optional).",
        },
    },
    required=["customer_name", "preferred_time"],
    handler=book_appointment_handler,
)
