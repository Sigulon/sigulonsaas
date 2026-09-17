"""Database store access for the campaign worker.
Supports MongoDB Atlas (PyMongo) and table-like mock clients for tests.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

NONTERMINAL_CONTACT = ("pending", "queued", "calling", "dialing", "ringing", "answered")
ACTIVE_BATCH_CONTACT = ("queued", "calling", "dialing", "ringing", "answered")


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_mock(client: Any) -> bool:
    return callable(getattr(client, "table", None))


def _one(client: Any, table: str, select: str, filters: dict[str, Any]) -> Optional[dict]:
    query = client.table(table).select(select)
    for key, value in filters.items():
        query = query.eq(key, value)
    try:
        return query.maybe_single().execute().data
    except Exception:
        return None


def get_campaign(client: Any, campaign_id: str) -> Optional[dict]:
    if _is_mock(client):
        return _one(
            client,
            "campaigns",
            "id, org_id, agent_id, status, retry_config",
            {"id": campaign_id},
        )
    from bson import ObjectId
    q = {"_id": ObjectId(campaign_id)} if ObjectId.is_valid(campaign_id) else {"_id": campaign_id}
    doc = client.campaigns.find_one(q)
    if not doc:
        return None
    return {
        "id": str(doc["_id"]),
        "org_id": str(doc.get("organizationId", "")),
        "agent_id": str(doc.get("agentId", "")),
        "status": doc.get("status", "draft"),
        "retry_config": {
            "max_attempts": (doc.get("retryConfig") or {}).get("maxAttempts"),
        },
    }


def get_agent(client: Any, agent_id: str) -> Optional[dict]:
    if _is_mock(client):
        return _one(client, "voice_agents", "id, org_id, status, language, voice_id", {"id": agent_id})
    from bson import ObjectId
    q = {"_id": ObjectId(agent_id)} if ObjectId.is_valid(agent_id) else {"_id": agent_id}
    doc = client.agents.find_one(q)
    if not doc:
        return None
    cfg = doc.get("config") or {}
    return {
        "id": str(doc["_id"]),
        "org_id": str(doc.get("organizationId", "")),
        "status": doc.get("status", "draft"),
        "language": cfg.get("identity", {}).get("language", "hi"),
        "voice_id": cfg.get("voice", {}).get("voiceId", ""),
    }


def get_outbound_number(client: Any, org_id: str) -> Optional[dict]:
    """First outbound-capable number, Plivo rows preferred."""
    if _is_mock(client):
        try:
            rows = (
                client.table("phone_numbers")
                .select("id, phone_number, provider")
                .eq("org_id", org_id)
                .in_("direction", ["outbound", "both"])
                .limit(10)
                .execute()
            ).data or []
        except Exception:
            return None
        rows = sorted(rows, key=lambda r: 0 if r.get("provider") == "plivo" else 1)
        return rows[0] if rows else None
    from bson import ObjectId
    q_org = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
    rows = list(client.phone_numbers.find({
        "organizationId": q_org,
        "direction": {"$in": ["outbound", "both"]},
    }).limit(10))
    if not rows:
        return None
    rows.sort(key=lambda r: 0 if r.get("provider") == "plivo" else 1)
    best = rows[0]
    return {
        "id": str(best["_id"]),
        "phone_number": best.get("phoneNumber"),
        "provider": best.get("provider", "plivo"),
    }


def get_active_provider_account(
    client: Any, org_id: str, provider: str
) -> Optional[dict[str, str]]:
    """Encrypted BYOC record for an organization, without attempting decryption."""
    if _is_mock(client):
        try:
            row = _one(
                client,
                "provider_accounts",
                "org_id, provider, credentials_encrypted, encryption_iv, status",
                {"org_id": org_id, "provider": provider},
            )
            if row and row.get("status") == "active":
                return {
                    "credentials_encrypted": str(row.get("credentials_encrypted") or ""),
                    "encryption_iv": str(row.get("encryption_iv") or ""),
                }
            return None
        except Exception:
            return None
    from bson import ObjectId
    try:
        q_org = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
        doc = client.provider_accounts.find_one({
            "organizationId": q_org,
            "provider": provider,
            "status": "active",
        })
        if not doc:
            return None
        return {
            "credentials_encrypted": str(doc.get("credentialsEncrypted") or ""),
            "encryption_iv": str(doc.get("encryptionIv") or ""),
        }
    except Exception:
        return None


def get_contact(client: Any, contact_id: str) -> Optional[dict]:
    if _is_mock(client):
        return _one(client, "contacts", "id, org_id, phone_number, normalized_phone, do_not_call", {"id": contact_id})
    from bson import ObjectId
    q = {"_id": ObjectId(contact_id)} if ObjectId.is_valid(contact_id) else {"_id": contact_id}
    doc = client.contacts.find_one(q)
    if not doc:
        return None
    return {
        "id": str(doc["_id"]),
        "org_id": str(doc.get("organizationId", "")),
        "phone_number": doc.get("phoneNumber"),
        "normalized_phone": doc.get("normalizedPhone"),
        "do_not_call": doc.get("doNotCall", False),
    }


def get_campaign_contact(
    client: Any, campaign_id: str, contact_id: str
) -> Optional[dict]:
    if _is_mock(client):
        return _one(
            client,
            "campaign_contacts",
            "campaign_id, contact_id, call_status, attempt_count, "
            "last_attempt_at, next_attempt_at",
            {"campaign_id": campaign_id, "contact_id": contact_id},
        )
    from bson import ObjectId
    c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
    ct_oid = ObjectId(contact_id) if ObjectId.is_valid(contact_id) else contact_id
    doc = client.campaign_contacts.find_one({"campaignId": c_oid, "contactId": ct_oid})
    if not doc:
        return None
    return {
        "campaign_id": campaign_id,
        "contact_id": contact_id,
        "call_status": doc.get("callStatus"),
        "attempt_count": doc.get("attemptCount", 0),
        "last_attempt_at": str(doc.get("lastAttemptAt") or ""),
        "next_attempt_at": str(doc.get("nextAttemptAt") or ""),
    }


def is_dnc(client: Any, org_id: str, normalized: str) -> bool:
    """True when the normalized number sits in the org's DNC entries."""
    if _is_mock(client):
        return (
            _one(
                client,
                "dnc_entries",
                "normalized_phone",
                {"org_id": org_id, "normalized_phone": normalized},
            )
            is not None
        )
    from bson import ObjectId
    q_org = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
    doc = client.dnc_entries.find_one({"organizationId": q_org, "normalizedPhone": normalized})
    return doc is not None


def insert_call(client: Any, row: dict[str, Any]) -> Optional[str]:
    if _is_mock(client):
        try:
            data = client.table("calls").insert(row).select("id").single().execute().data
            return (data or {}).get("id")
        except Exception:
            return None
    from bson import ObjectId
    doc = {
        "organizationId": ObjectId(row["org_id"]) if ObjectId.is_valid(row.get("org_id", "")) else row.get("org_id"),
        "campaignId": ObjectId(row["campaign_id"]) if ObjectId.is_valid(row.get("campaign_id", "")) else None,
        "contactId": ObjectId(row["contact_id"]) if ObjectId.is_valid(row.get("contact_id", "")) else None,
        "agentId": ObjectId(row["agent_id"]) if ObjectId.is_valid(row.get("agent_id", "")) else None,
        "direction": row.get("direction", "outbound"),
        "status": row.get("status", "QUEUED").upper(),
        "toNumber": row.get("to_number", ""),
        "fromNumber": row.get("from_number", ""),
        "provider": row.get("provider", "plivo"),
        "durationSeconds": 0,
        "costCredits": 0,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }
    res = client.calls.insert_one(doc)
    return str(res.inserted_id)


def update_call(client: Any, call_id: str, patch: dict[str, Any]) -> bool:
    if _is_mock(client):
        try:
            client.table("calls").update(patch).eq("id", call_id).execute()
            return True
        except Exception:
            return False
    from bson import ObjectId
    q = {"_id": ObjectId(call_id)} if ObjectId.is_valid(call_id) else {"_id": call_id}
    mongo_patch = dict(patch)
    if "status" in mongo_patch:
        mongo_patch["status"] = mongo_patch["status"].upper()
    if "duration_seconds" in mongo_patch:
        mongo_patch["durationSeconds"] = mongo_patch.pop("duration_seconds")
    mongo_patch["updatedAt"] = datetime.now(timezone.utc)
    client.calls.update_one(q, {"$set": mongo_patch})
    return True


def set_contact_status(
    client: Any,
    campaign_id: str,
    contact_id: str,
    status: str,
    *,
    attempt_count: Optional[int] = None,
    next_attempt_at: Optional[str] = None,
) -> bool:
    if _is_mock(client):
        patch: dict[str, Any] = {"call_status": status}
        if attempt_count is not None:
            patch["attempt_count"] = attempt_count
        patch["last_attempt_at"] = utcnow_iso()
        if next_attempt_at is not None:
            patch["next_attempt_at"] = next_attempt_at
        try:
            client.table("campaign_contacts").update(patch).eq(
                "campaign_id", campaign_id
            ).eq("contact_id", contact_id).execute()
            return True
        except Exception:
            return False
    from bson import ObjectId
    c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
    ct_oid = ObjectId(contact_id) if ObjectId.is_valid(contact_id) else contact_id
    mongo_patch: dict[str, Any] = {"callStatus": status, "lastAttemptAt": datetime.now(timezone.utc)}
    if attempt_count is not None:
        mongo_patch["attemptCount"] = attempt_count
    if next_attempt_at is not None:
        mongo_patch["nextAttemptAt"] = next_attempt_at
    client.campaign_contacts.update_one({"campaignId": c_oid, "contactId": ct_oid}, {"$set": mongo_patch})
    return True


def insert_call_event(
    client: Any,
    *,
    org_id: str,
    call_id: str,
    event: str,
    provider_event_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    if _is_mock(client):
        try:
            client.table("call_events").insert({
                "org_id": org_id,
                "call_id": call_id,
                "event": event,
                "provider_event_id": provider_event_id,
                "payload": payload or {},
            }).execute()
        except Exception:
            pass
        return
    from bson import ObjectId
    try:
        client.call_events.insert_one({
            "organizationId": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id,
            "callId": ObjectId(call_id) if ObjectId.is_valid(call_id) else call_id,
            "type": event,
            "idempotencyKey": provider_event_id or f"{event}:{call_id}",
            "data": payload or {},
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception:
        pass


def running_campaign_ids(client: Any, limit: int = 200) -> list[str]:
    if _is_mock(client):
        try:
            rows = (
                client.table("campaigns")
                .select("id")
                .eq("status", "running")
                .limit(limit)
                .execute()
            ).data or []
        except Exception:
            return []
        return [row["id"] for row in rows if row.get("id")]
    try:
        return [str(c["_id"]) for c in client.campaigns.find({"status": "running"}).limit(limit)]
    except Exception:
        return []


def stale_contacts(
    client: Any,
    campaign_id: str,
    statuses: tuple[str, ...],
    cutoff_iso: str,
    limit: int = 500,
) -> list[dict]:
    """Contacts stuck in `statuses` with no attempt since `cutoff_iso`."""
    if _is_mock(client):
        try:
            return (
                client.table("campaign_contacts")
                .select("campaign_id, contact_id, call_status, attempt_count, last_attempt_at")
                .eq("campaign_id", campaign_id)
                .in_("call_status", list(statuses))
                .lt("last_attempt_at", cutoff_iso)
                .order("contact_id")
                .limit(limit)
                .execute()
            ).data or []
        except Exception:
            return []
    from bson import ObjectId
    try:
        c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
        docs = list(client.campaign_contacts.find({
            "campaignId": c_oid,
            "callStatus": {"$in": list(statuses)},
        }).limit(limit))
        return [
            {
                "campaign_id": str(d.get("campaignId")),
                "contact_id": str(d.get("contactId")),
                "call_status": d.get("callStatus"),
                "attempt_count": d.get("attemptCount", 0),
                "last_attempt_at": str(d.get("lastAttemptAt") or ""),
            }
            for d in docs
        ]
    except Exception:
        return []


def latest_call_for_contact(
    client: Any, campaign_id: str, contact_id: str
) -> Optional[dict]:
    if _is_mock(client):
        try:
            rows = (
                client.table("calls")
                .select("id, status")
                .eq("campaign_id", campaign_id)
                .eq("contact_id", contact_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            ).data or []
        except Exception:
            return None
        return rows[0] if rows else None
    from bson import ObjectId
    try:
        c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
        ct_oid = ObjectId(contact_id) if ObjectId.is_valid(contact_id) else contact_id
        doc = client.calls.find_one({"campaignId": c_oid, "contactId": ct_oid}, sort=[("createdAt", -1)])
        if not doc:
            return None
        return {"id": str(doc["_id"]), "status": doc.get("status", "").lower()}
    except Exception:
        return None


def latest_queued_call(
    client: Any, org_id: str, contact_id: str, call_id: Optional[str] = None
) -> Optional[dict]:
    """The single-dial `calls` row waiting for a dial (web-created, queued)."""
    if _is_mock(client):
        try:
            query = (
                client.table("calls")
                .select("id, agent_id, status")
                .eq("org_id", org_id)
                .eq("contact_id", contact_id)
                .eq("direction", "outbound")
            )
            if call_id:
                query = query.eq("id", call_id)
            rows = query.order("created_at", desc=True).limit(1).execute().data or []
        except Exception:
            return None
        row = rows[0] if rows else None
        return row if row and row.get("status") == "queued" else None
    from bson import ObjectId
    try:
        o_oid = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
        ct_oid = ObjectId(contact_id) if ObjectId.is_valid(contact_id) else contact_id
        query: dict[str, Any] = {
            "organizationId": o_oid,
            "contactId": ct_oid,
            "direction": "outbound",
            "status": "QUEUED",
        }
        if call_id:
            query["_id"] = ObjectId(call_id) if ObjectId.is_valid(call_id) else call_id
        doc = client.calls.find_one(query, sort=[("createdAt", -1)])
        if not doc:
            return None
        return {"id": str(doc["_id"]), "agent_id": str(doc.get("agentId", "")), "status": "queued"}
    except Exception:
        return None


def nonterminal_contact_count(client: Any, campaign_id: str) -> Optional[int]:
    if _is_mock(client):
        try:
            res = (
                client.table("campaign_contacts")
                .select("contact_id", count="exact", head=True)
                .eq("campaign_id", campaign_id)
                .in_("call_status", list(NONTERMINAL_CONTACT))
                .execute()
            )
            return res.count
        except Exception:
            return None
    from bson import ObjectId
    try:
        c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
        return client.campaign_contacts.count_documents({
            "campaignId": c_oid,
            "callStatus": {"$in": list(NONTERMINAL_CONTACT)},
        })
    except Exception:
        return None


def has_active_batch_work(client: Any, campaign_id: str) -> bool:
    """Whether a campaign's current batch still has work in flight.

    Retried contacts return to ``pending`` with a positive attempt count; they
    remain part of the current batch until their scheduled retry terminalizes.
    Fresh, zero-attempt pending contacts are deliberately excluded so the
    worker can refill them only after that batch has drained.
    """
    if _is_mock(client):
        try:
            return any(
                row.get("campaign_id") == campaign_id
                and (
                    row.get("call_status") in ACTIVE_BATCH_CONTACT
                    or (
                        row.get("call_status") == "pending"
                        and int(row.get("attempt_count") or 0) > 0
                    )
                )
                for row in client.table("campaign_contacts").rows
            )
        except Exception:
            return True
    from bson import ObjectId
    try:
        c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
        return client.campaign_contacts.find_one({
            "campaignId": c_oid,
            "$or": [
                {"callStatus": {"$in": list(ACTIVE_BATCH_CONTACT)}},
                {"callStatus": "pending", "attemptCount": {"$gt": 0}},
            ],
        }) is not None
    except Exception:
        # On an unreadable database, never make a speculative new claim.
        return True


def claim_next_initial_batch(
    client: Any, campaign_id: str, limit: int = 500
) -> list[dict[str, Any]]:
    """Atomically mark up to ``limit`` fresh contacts queued and return them.

    A per-row find-and-update keeps the Mongo operation safe even if another
    worker bypasses the Redis dispatch lock. Returning only successfully
    transitioned rows ensures every queued job has exactly one owner.
    """
    if _is_mock(client):
        try:
            claimed: list[dict[str, Any]] = []
            for row in sorted(
                client.table("campaign_contacts").rows,
                key=lambda candidate: str(candidate.get("id", "")),
            ):
                if len(claimed) >= limit:
                    break
                if (
                    row.get("campaign_id") != campaign_id
                    or row.get("call_status") != "pending"
                    or int(row.get("attempt_count") or 0) != 0
                ):
                    continue
                row["call_status"] = "queued"
                row["last_attempt_at"] = utcnow_iso()
                claimed.append({
                    "id": str(row.get("id", row.get("contact_id"))),
                    "contact_id": str(row["contact_id"]),
                    "attempt_count": int(row.get("attempt_count") or 0),
                })
            return claimed
        except Exception:
            return []

    from bson import ObjectId
    from pymongo import ReturnDocument

    c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
    claimed = []
    for _ in range(limit):
        doc = client.campaign_contacts.find_one_and_update(
            {
                "campaignId": c_oid,
                "callStatus": "pending",
                "attemptCount": 0,
            },
            {
                "$set": {
                    "callStatus": "queued",
                    "lastAttemptAt": datetime.now(timezone.utc),
                }
            },
            sort=[("_id", 1)],
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            break
        claimed.append({
            "id": str(doc["_id"]),
            "contact_id": str(doc["contactId"]),
            "attempt_count": int(doc.get("attemptCount") or 0),
        })
    return claimed


def restore_initial_batch_claims(
    client: Any, campaign_id: str, claim_ids: list[str]
) -> None:
    """Undo claims when Redis rejects a batch before receiving any job."""
    if not claim_ids:
        return
    if _is_mock(client):
        rows = client.table("campaign_contacts").rows
        ids = set(claim_ids)
        for row in rows:
            if (
                str(row.get("id", row.get("contact_id"))) in ids
                and row.get("campaign_id") == campaign_id
                and row.get("call_status") == "queued"
                and int(row.get("attempt_count") or 0) == 0
            ):
                row["call_status"] = "pending"
        return

    from bson import ObjectId
    c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
    ids = [ObjectId(value) if ObjectId.is_valid(value) else value for value in claim_ids]
    client.campaign_contacts.update_many(
        {
            "_id": {"$in": ids},
            "campaignId": c_oid,
            "callStatus": "queued",
            "attemptCount": 0,
        },
        {"$set": {"callStatus": "pending"}},
    )


def complete_campaign(client: Any, campaign_id: str) -> bool:
    if _is_mock(client):
        try:
            client.table("campaigns").update({"status": "completed"}).eq(
                "id", campaign_id
            ).execute()
            return True
        except Exception:
            return False
    from bson import ObjectId
    try:
        c_oid = ObjectId(campaign_id) if ObjectId.is_valid(campaign_id) else campaign_id
        client.campaigns.update_one({"_id": c_oid}, {"$set": {"status": "completed"}})
        return True
    except Exception:
        return False


__all__ = [
    "NONTERMINAL_CONTACT",
    "ACTIVE_BATCH_CONTACT",
    "claim_next_initial_batch",
    "complete_campaign",
    "get_agent",
    "get_campaign",
    "get_campaign_contact",
    "get_contact",
    "get_outbound_number",
    "get_active_provider_account",
    "has_active_batch_work",
    "insert_call",
    "insert_call_event",
    "is_dnc",
    "latest_call_for_contact",
    "latest_queued_call",
    "nonterminal_contact_count",
    "running_campaign_ids",
    "restore_initial_batch_claims",
    "set_contact_status",
    "stale_contacts",
    "update_call",
    "utcnow_iso",
]
