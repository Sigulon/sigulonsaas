"""``check_availability``: real availability from the org's appointments."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Annotated, Any

from tools.common import (
    appointment_window,
    ctx_ids,
    org_appointments_on,
    overlaps,
    parse_datetime,
)

log = logging.getLogger("voice-runtime.tools.availability")


async def check_availability_impl(
    tenant_id: str,
    *,
    date: str = "",
    time: str = "",
    duration_minutes: int = 30,
) -> dict[str, Any]:
    date = (date or "").strip()
    time = (time or "").strip()
    try:
        duration_minutes = max(5, min(480, int(duration_minutes or 30)))
    except (TypeError, ValueError):
        duration_minutes = 30

    start = parse_datetime(f"{date} {time}".strip()) if date else None
    if start is None and date:
        start = parse_datetime(date)
    if start is None:
        return {
            "status": "error",
            "error": "Give a date like 2026-09-12, optionally with a time like 15:30.",
        }

    end = start + timedelta(minutes=duration_minutes)
    day_start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    try:
        day_appts = await org_appointments_on(tenant_id, day_start, day_end)
    except Exception as exc:  # noqa: BLE001 - availability must degrade, not die
        log.exception("availability lookup failed")
        return {"status": "error", "error": str(exc)}

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
        return {
            "status": "busy",
            "available": False,
            "requested_start": start.isoformat(),
            "requested_end": end.isoformat(),
            "conflicts": conflicts,
            "message": "That slot is taken. Offer the caller a nearby time.",
        }
    return {
        "status": "free",
        "available": True,
        "requested_start": start.isoformat(),
        "requested_end": end.isoformat(),
        "message": "The slot is free — confirm it with the caller, then book it.",
    }


try:
    from livekit.agents import RunContext, function_tool

    @function_tool()
    async def check_availability(
        context: RunContext,
        date: Annotated[str, "Date as YYYY-MM-DD, e.g. '2026-09-12'."],
        time: Annotated[str, "Time as HH:MM in 24h, e.g. '15:30'. Omit to check the whole day."] = "",
        duration_minutes: Annotated[int, "Length of the slot in minutes (default 30)."] = 30,
    ) -> dict[str, Any]:
        """Check whether a date/time slot is free on the business calendar. Call this BEFORE offering or confirming any appointment time."""
        _, tenant_id, _ = ctx_ids(context)
        return await check_availability_impl(
            tenant_id, date=date, time=time, duration_minutes=duration_minutes
        )
except ImportError:  # pragma: no cover
    async def check_availability(context: Any, **kwargs: Any) -> dict[str, Any]:  # type: ignore[no-redef]
        """Check whether a date/time slot is free on the business calendar. Call this BEFORE offering or confirming any appointment time."""
        _, tenant_id, _ = ctx_ids(context)
        return await check_availability_impl(tenant_id, **kwargs)


async def check_availability_handler(params: Any) -> dict[str, Any]:
    args = getattr(params, "arguments", {}) or {}
    _, tenant_id, _ = ctx_ids(params)
    result = await check_availability_impl(
        tenant_id,
        date=str(args.get("date", "")),
        time=str(args.get("time", "")),
        duration_minutes=args.get("duration_minutes", 30),
    )
    cb = getattr(params, "result_callback", None)
    if callable(cb):
        await cb(result)
    return result


CHECK_AVAILABILITY_SPEC = {
    "name": "check_availability",
    "description": (
        "Check whether a date/time slot is free on the business calendar. "
        "Call this BEFORE offering or confirming any appointment time."
    ),
    "properties": {
        "date": {"type": "string", "description": "Date as YYYY-MM-DD, e.g. '2026-09-12'."},
        "time": {"type": "string", "description": "Time as HH:MM in 24h, e.g. '15:30'. Omit to check the whole day."},
        "duration_minutes": {"type": "integer", "description": "Length of the slot in minutes (default 30)."},
    },
    "required": ["date"],
}

CHECK_AVAILABILITY_SCHEMA = CHECK_AVAILABILITY_SPEC
