"""``check_availability``: real availability from the org's appointments."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from tools.common import (
    appointment_window,
    ctx_ids,
    org_appointments_on,
    overlaps,
    parse_datetime,
)

log = logging.getLogger("voice-runtime.tools.availability")


async def check_availability_handler(params: FunctionCallParams) -> None:
    date = str(params.arguments.get("date", "")).strip()
    time = str(params.arguments.get("time", "")).strip()
    try:
        duration_minutes = max(5, min(480, int(params.arguments.get("duration_minutes", 30))))
    except (TypeError, ValueError):
        duration_minutes = 30

    _, tenant_id, _ = ctx_ids(params)

    start = parse_datetime(f"{date} {time}".strip()) if date else None
    if start is None and date:
        start = parse_datetime(date)
    if start is None:
        await params.result_callback({
            "status": "error",
            "error": "Give a date like 2026-09-12, optionally with a time like 15:30.",
        })
        return

    end = start + timedelta(minutes=duration_minutes)
    day_start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    try:
        day_appts = await org_appointments_on(tenant_id, day_start, day_end)
    except Exception as exc:  # noqa: BLE001 - availability must degrade, not die
        log.exception("availability lookup failed")
        await params.result_callback({"status": "error", "error": str(exc)})
        return

    conflicts = []
    for appt in day_appts:
        a_start, a_end = appointment_window(appt)
        if overlaps(start, end, a_start, a_end):
            conflicts.append({
                "title": appt.get("title"),
                "start_time": a_start.isoformat(),
                "end_time": a_end.isoformat(),
            })

    if conflicts:
        await params.result_callback({
            "status": "busy",
            "available": False,
            "requested_start": start.isoformat(),
            "requested_end": end.isoformat(),
            "conflicts": conflicts,
            "message": "That slot is taken. Offer the caller a nearby time.",
        })
    else:
        await params.result_callback({
            "status": "free",
            "available": True,
            "requested_start": start.isoformat(),
            "requested_end": end.isoformat(),
            "message": "The slot is free — confirm it with the caller, then book it.",
        })


CHECK_AVAILABILITY_SCHEMA = FunctionSchema(
    name="check_availability",
    description=(
        "Check whether a date/time slot is free on the business calendar. "
        "Call this BEFORE offering or confirming any appointment time."
    ),
    properties={
        "date": {
            "type": "string",
            "description": "Date as YYYY-MM-DD, e.g. '2026-09-12'.",
        },
        "time": {
            "type": "string",
            "description": "Time as HH:MM in 24h, e.g. '15:30'. Omit to check the whole day.",
        },
        "duration_minutes": {
            "type": "integer",
            "description": "Length of the slot in minutes (default 30).",
        },
    },
    required=["date"],
    handler=check_availability_handler,
)
