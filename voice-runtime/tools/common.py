"""Shared MongoDB helpers for org-scoped voice tools.

Every tool receives the call context from Pipecat and uses its tenant id to
scope reads and writes. The web control plane, runtime, and worker all use
the same MongoDB collections; there is deliberately no secondary database fallback.
"""

from __future__ import annotations

import asyncio
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

_mongo_client: Optional[Any] = None
_database: Optional[Any] = None


def get_database() -> Any:
    """Return the shared MongoDB database used by the control plane."""
    global _mongo_client, _database
    if _database is not None:
        return _database

    try:
        from pymongo import MongoClient
    except ImportError as exc:  # pragma: no cover - deployment dependency
        raise RuntimeError("The 'pymongo' package is required.") from exc

    uri = os.getenv("MONGODB_URI", "").strip()
    if not uri:
        raise RuntimeError("MONGODB_URI is not configured.")

    _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=8_000)
    try:
        _database = _mongo_client.get_default_database()
    except Exception:
        _database = _mongo_client[os.getenv("MONGODB_DATABASE", "sigulon")]
    return _database


def _object_id(value: str | None) -> Any | None:
    if not value:
        return None
    from bson import ObjectId

    return ObjectId(value) if ObjectId.is_valid(value) else None


async def run_db(fn, *args, **kwargs) -> Any:
    """Run one blocking PyMongo operation away from the event loop."""
    return await asyncio.to_thread(fn, *args, **kwargs)


def ctx_ids(params: Any) -> tuple[str, str, str]:
    """Return ``(call_id, tenant_id, agent_id)`` from Pipecat resources."""
    resources = getattr(params, "app_resources", None)
    call_id = str(getattr(resources, "call_id", "") or "")
    tenant_id = str(getattr(resources, "tenant_id", "") or "")
    agent_id = str(getattr(resources, "agent_id", "") or "")
    return call_id, tenant_id, agent_id


async def load_agent(tenant_id: str, agent_id: str) -> Optional[dict[str, Any]]:
    """Load an active agent after verifying its organization ownership."""
    tenant_oid = _object_id(tenant_id)
    agent_oid = _object_id(agent_id)
    if tenant_oid is None or agent_oid is None:
        return None

    def _query() -> Optional[dict[str, Any]]:
        doc = get_database().agents.find_one({
            "_id": agent_oid,
            "organizationId": tenant_oid,
            "status": "active",
        })
        if not doc:
            return None
        config = doc.get("config") or {}
        return {
            "id": str(doc["_id"]),
            "org_id": str(doc["organizationId"]),
            "status": doc.get("status"),
            "settings": config.get("settings") or {},
        }

    return await run_db(_query)


async def load_call(call_id: str, tenant_id: str) -> Optional[dict[str, Any]]:
    """Load a call after verifying its organization ownership."""
    call_oid = _object_id(call_id)
    tenant_oid = _object_id(tenant_id)
    if call_oid is None or tenant_oid is None:
        return None

    def _query() -> Optional[dict[str, Any]]:
        doc = get_database().calls.find_one({
            "_id": call_oid,
            "organizationId": tenant_oid,
        })
        if not doc:
            return None
        return {
            "id": str(doc["_id"]),
            "org_id": str(doc["organizationId"]),
            "agent_id": str(doc.get("agentId") or ""),
            "contact_id": str(doc.get("contactId") or "") or None,
            "provider_call_id": doc.get("providerCallId"),
            "direction": doc.get("direction"),
        }

    return await run_db(_query)


def parse_datetime(raw: str) -> Optional[datetime]:
    """Parse a caller-supplied datetime and normalize it to UTC."""
    patterns = (
        "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M%z",
        "%Y-%m-%d %H:%M:%S%z", "%Y-%m-%d %H:%M%z",
        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    )
    text = (raw or "").strip().replace("Z", "+0000").replace("z", "+0000")
    text = re.sub(r"([+-]\d{2}):(\d{2})$", r"\1\2", text)
    for pattern in patterns:
        try:
            parsed = datetime.strptime(text, pattern)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def appointment_window(appt: dict[str, Any], default_minutes: int = 30) -> tuple[datetime, datetime]:
    """Return an appointment window; a missing end defaults to 30 minutes."""
    start = appt["start_time"]
    if isinstance(start, str):
        start = datetime.fromisoformat(start.replace("Z", "+00:00"))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = appt.get("end_time")
    if isinstance(end, str):
        end = datetime.fromisoformat(end.replace("Z", "+00:00"))
    if end is None:
        end = start + timedelta(minutes=default_minutes)
    elif end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


async def org_appointments_on(
    tenant_id: str, day_start: datetime, day_end: datetime
) -> list[dict[str, Any]]:
    """List non-cancelled appointments that start during a UTC day."""
    tenant_oid = _object_id(tenant_id)
    if tenant_oid is None:
        return []

    def _query() -> list[dict[str, Any]]:
        rows = get_database().appointments.find({
            "organizationId": tenant_oid,
            "startTime": {"$gte": day_start, "$lt": day_end},
            "status": {"$ne": "cancelled"},
        }).sort("startTime", 1).limit(100)
        return [
            {
                "id": str(row["_id"]),
                "title": row.get("title", "Appointment"),
                "start_time": row.get("startTime"),
                "end_time": row.get("endTime"),
                "status": row.get("status", "scheduled"),
            }
            for row in rows
        ]

    return await run_db(_query)


def object_id(value: str | None) -> Any | None:
    """Public ObjectId parser for scoped tool writes."""
    return _object_id(value)


__all__ = [
    "appointment_window",
    "ctx_ids",
    "get_database",
    "load_agent",
    "load_call",
    "object_id",
    "org_appointments_on",
    "overlaps",
    "parse_datetime",
    "run_db",
]
