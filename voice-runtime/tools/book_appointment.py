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
from typing import Annotated, Any

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


async def book_appointment_impl(
    call_id: str,
    tenant_id: str,
    agent_id: str,
    *,
    customer_name: str = "",
    preferred_time: str = "",
    duration_minutes: int = 30,
    notes: str = "",
) -> dict[str, Any]:
    customer_name = (customer_name or "").strip()
    preferred_time = (preferred_time or "").strip()
    notes = (notes or "").strip()
    try:
        duration_minutes = max(5, min(480, int(duration_minutes or 30)))
    except (TypeError, ValueError):
        duration_minutes = 30

    if not customer_name or not preferred_time:
        return {
            "status": "error",
            "error": "Both 'customer_name' and 'preferred_time' are required.",
        }

    start = parse_datetime(preferred_time)
    if start is None:
        return {
            "status": "error",
            "error": (
                "I couldn't pin that time down — ask the caller for a date "
                "like 12 September and a time like 4pm, then try again."
            ),
        }
    end = start + timedelta(minutes=duration_minutes)

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
            return {
                "status": "conflict",
                "conflicts": conflicts,
                "message": "That slot just got taken — offer the caller a nearby time.",
            }

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
        return {"status": "error", "error": str(exc)}

    log.info("Appointment booked: org=%s appt=%s start=%s", tenant_id,
             (row or {}).get("id"), start.isoformat())
    return {
        "status": "booked",
        "appointment_id": (row or {}).get("id"),
        "customer_name": customer_name,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "confirmation": (
            f"Appointment booked for {customer_name} at {start.isoformat()}."
        ),
    }


try:
    from livekit.agents import RunContext, function_tool

    @function_tool()
    async def book_appointment(
        context: RunContext,
        customer_name: Annotated[str, "The customer's full name as they stated it."],
        preferred_time: Annotated[str, "Date/time, e.g. '2026-09-12 15:30' or '2026-09-12T15:30:00+05:30'."],
        duration_minutes: Annotated[int, "Length in minutes (default 30)."] = 30,
        notes: Annotated[str, "Anything the business should know (optional)."] = "",
    ) -> dict[str, Any]:
        """Book an appointment for the customer. Call this when the caller agrees to a time or asks to schedule, reschedule, or confirm a visit."""
        call_id, tenant_id, agent_id = ctx_ids(context)
        return await book_appointment_impl(
            call_id, tenant_id, agent_id,
            customer_name=customer_name,
            preferred_time=preferred_time,
            duration_minutes=duration_minutes,
            notes=notes,
        )
except ImportError:  # pragma: no cover - livekit-agents missing in some test envs
    async def book_appointment(context: Any, **kwargs: Any) -> dict[str, Any]:  # type: ignore[no-redef]
        """Book an appointment for the customer. Call this when the caller agrees to a time or asks to schedule, reschedule, or confirm a visit."""
        call_id, tenant_id, agent_id = ctx_ids(context)
        return await book_appointment_impl(call_id, tenant_id, agent_id, **kwargs)


async def book_appointment_handler(params: Any) -> dict[str, Any]:
    """Legacy handler shape (tests): params.arguments + result_callback."""
    args = getattr(params, "arguments", {}) or {}
    call_id, tenant_id, agent_id = ctx_ids(params)
    result = await book_appointment_impl(
        call_id, tenant_id, agent_id,
        customer_name=str(args.get("customer_name", "")),
        preferred_time=str(args.get("preferred_time", "")),
        duration_minutes=args.get("duration_minutes", 30),
        notes=str(args.get("notes", "")),
    )
    cb = getattr(params, "result_callback", None)
    if callable(cb):
        await cb(result)
    return result


BOOK_APPOINTMENT_SPEC = {
    "name": "book_appointment",
    "description": (
        "Book an appointment for the customer. Call this when the caller "
        "agrees to a time or asks to schedule, reschedule, or confirm a visit."
    ),
    "properties": {
        "customer_name": {"type": "string", "description": "The customer's full name as they stated it."},
        "preferred_time": {"type": "string", "description": "Date/time, e.g. '2026-09-12 15:30' or '2026-09-12T15:30:00+05:30'."},
        "duration_minutes": {"type": "integer", "description": "Length in minutes (default 30)."},
        "notes": {"type": "string", "description": "Anything the business should know (optional)."},
    },
    "required": ["customer_name", "preferred_time"],
}

# Back-compat alias for ported tests importing the old legacy-rtc schema name.
BOOK_APPOINTMENT_SCHEMA = BOOK_APPOINTMENT_SPEC
