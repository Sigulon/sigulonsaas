"""Live-call state (process memory + Redis) and idempotent MongoDB cleanup.

Two Redis keys per call:

* ``sigulon:session:{call_id}:state`` — the :class:`VoiceSession` JSON
  (who is on this call, what stage, last heartbeat). TTL 2h.
* ``sigulon:call:{call_id}:finalized`` — idempotency marker set by
  :func:`finalize_call`. ``SET NX`` makes double-finalize (WebSocket close
  *and* status-callback *and* worker retry) a no-op.

MongoDB is the durable record: ``calls`` gets its terminal status /
duration / ``ended_at``; ``call_events`` gets one ``finalized`` audit row
(``provider_event_id`` = ``finalized:{call_id}`` so redelivery dedupes on
the existing partial unique index).

Everything here is best-effort: cleanup must never raise out of a
``finally`` block. Every failure is logged and swallowed, except the
idempotency fast-path which returns before doing any work.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

log = logging.getLogger("voice-runtime.session")

SESSION_KEY = "sigulon:session:{call_id}:state"
FINALIZED_KEY = "sigulon:call:{call_id}:finalized"

SESSION_TTL_SECS = int(os.getenv("VOICE_SESSION_TTL_SECS", "7200"))
FINALIZED_TTL_SECS = int(os.getenv("CALL_FINALIZED_TTL_SECS", "86400"))

SessionStatus = Literal["created", "active", "ended"]


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class VoiceSession(BaseModel):
    """Who is on this call, on which providers, at what stage."""

    session_id: str = Field(description="== calls.id (also the Plivo WS path id)")
    call_id: str
    org_id: str = Field(description="organizations.id owning the agent")
    agent_id: str = Field(description="agents.id handling the call")
    direction: Literal["inbound", "outbound"] = "inbound"
    provider_call_id: Optional[str] = Field(
        default=None, description="Plivo CallUUID once the start event lands",
    )
    plivo_stream_id: Optional[str] = Field(default=None)
    stt_provider: str = "cartesia"
    llm_provider: str = "openrouter"
    tts_provider: str = "cartesia"
    status: SessionStatus = "created"
    created_at: str = Field(default_factory=_utcnow_iso)
    updated_at: str = Field(default_factory=_utcnow_iso)
    last_heartbeat_at: str = Field(default_factory=_utcnow_iso)


@dataclass
class LocalCallState:
    """State owned by this runtime process for a live Pipecat call.

    Redis remains the shared/distributed coordination store; turn processing
    uses this object so a transient Redis outage never adds a round trip to
    the real-time pipeline.
    """

    session: VoiceSession
    agent_config: Any = None
    pipeline: Any = None
    conversation_context: Any = None
    started_at: str = field(default_factory=_utcnow_iso)
    recording_state: str = "pending"
    transcript_state: str = "pending"


_local_sessions: dict[str, VoiceSession] = {}
_local_call_states: dict[str, LocalCallState] = {}


def register_local_call(
    session: VoiceSession,
    *,
    agent_config: Any,
    pipeline: Any,
    conversation_context: Any,
) -> LocalCallState:
    """Register the per-call real-time state after Pipecat is assembled."""
    _local_sessions[session.call_id] = session
    state = LocalCallState(
        session=session,
        agent_config=agent_config,
        pipeline=pipeline,
        conversation_context=conversation_context,
    )
    _local_call_states[session.call_id] = state
    return state


def get_local_call_state(call_id: str) -> Optional[LocalCallState]:
    """Return process-local state for diagnostics without touching Redis."""
    return _local_call_states.get(call_id)


def _redis():  # lazy import keeps `import session` cheap for tests
    from config import get_redis

    return get_redis()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def create_session(session: VoiceSession) -> VoiceSession:
    """Persist a new session (status forced to ``created``)."""
    session.status = "created"
    now = _utcnow_iso()
    session.created_at = now
    session.updated_at = now
    session.last_heartbeat_at = now
    _local_sessions[session.call_id] = session
    try:
        await _redis().set(
            SESSION_KEY.format(call_id=session.call_id),
            session.model_dump_json(),
            ex=SESSION_TTL_SECS,
        )
    except Exception as exc:  # noqa: BLE001 - tracking must never break calls
        log.warning("session create failed for call %s: %s", session.call_id, exc)
    return session


async def get_session(call_id: str) -> Optional[VoiceSession]:
    """Fetch the live session for a call, or None."""
    local = _local_sessions.get(call_id)
    if local is not None:
        return local
    try:
        raw = await _redis().get(SESSION_KEY.format(call_id=call_id))
    except Exception as exc:  # noqa: BLE001
        log.warning("session fetch failed for call %s: %s", call_id, exc)
        return None
    if not raw:
        return None
    try:
        session = VoiceSession.model_validate_json(raw)
        _local_sessions[call_id] = session
        return session
    except Exception as exc:  # noqa: BLE001 - corrupt entry reads as missing
        log.warning("session decode failed for call %s: %s", call_id, exc)
        return None


async def heartbeat(
    call_id: str,
    *,
    status: Optional[SessionStatus] = None,
    provider_call_id: Optional[str] = None,
    plivo_stream_id: Optional[str] = None,
) -> Optional[VoiceSession]:
    """Refresh liveness (and optionally stage/provider ids)."""
    session = await get_session(call_id)
    if session is None:
        return None
    now = _utcnow_iso()
    session.last_heartbeat_at = now
    session.updated_at = now
    if status is not None:
        session.status = status
    if provider_call_id is not None:
        session.provider_call_id = provider_call_id
    if plivo_stream_id is not None:
        session.plivo_stream_id = plivo_stream_id
    _local_sessions[call_id] = session
    try:
        await _redis().set(
            SESSION_KEY.format(call_id=call_id),
            session.model_dump_json(),
            ex=SESSION_TTL_SECS,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("session heartbeat failed for call %s: %s", call_id, exc)
    return session


async def delete_session(call_id: str) -> None:
    """Drop the Redis session record (post-finalize hygiene)."""
    _local_sessions.pop(call_id, None)
    _local_call_states.pop(call_id, None)
    try:
        await _redis().delete(SESSION_KEY.format(call_id=call_id))
    except Exception as exc:  # noqa: BLE001
        log.warning("session delete failed for call %s: %s", call_id, exc)


async def is_finalized(call_id: str) -> bool:
    """True if :func:`finalize_call` already ran for this call."""
    try:
        return bool(await _redis().exists(FINALIZED_KEY.format(call_id=call_id)))
    except Exception:  # noqa: BLE001 - fail open; finalize re-checks with NX
        return False


# ---------------------------------------------------------------------------
# Durable cleanup (the one funnel every exit path goes through)
# ---------------------------------------------------------------------------


def _mongo_database() -> Any:
    """Reuse config.py's process-wide MongoDB client and connection pool."""
    from config import get_mongo_database

    return get_mongo_database()


def _terminal_status_for(outcome: str) -> str:
    """Map a runtime outcome string onto the ``calls.status`` check set.

    Unknown or empty outcomes are failures, never silent successes: the
    caller must explicitly report completion.
    """
    outcome = (outcome or "").lower()
    if outcome in ("completed", "success", "timeout"):
        return "completed"
    if "busy" in outcome:
        return "busy"
    if "no_answer" in outcome or "no-answer" in outcome:
        return "no_answer"
    if "cancel" in outcome:
        return "cancelled"
    # Everything else — errors, rejections, setup failures, empty or novel
    # strings — is a failure so success metrics and usage rating stay honest.
    return "failed"


_local_finalized_calls: set[str] = set()
_LOCAL_FINALIZED_CAP = 10000


async def finalize_call(
    *,
    call_id: str,
    outcome: str,
    duration_seconds: int,
    tenant_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    transcript: Optional[list[dict[str, str]]] = None,
    summary: Optional[str] = None,
    disposition: Optional[str] = None,
    recording_data: Optional[dict[str, Any]] = None,
) -> bool:
    """Idempotent end-of-call cleanup. Returns True if this call finalized.

    Steps (all best-effort, never raises):
    1. ``SET NX`` the finalized marker — second callers return False fast.
    2. Release the tenant concurrency slot.
    3. Update ``calls`` (terminal status, duration, ``ended_at``; plus the
       captured transcript, LLM summary, and sales disposition when present
       — the disposition wins over the runtime outcome string).
    4. Insert the ``finalized`` audit row into ``call_events`` (dedupes on
       ``(call_id, provider_event_id)``).
    5. Delete the Redis session record.

    Safe to call from the WebSocket ``finally``, the status-callback, and
    the internal finalize endpoint concurrently. Returns False when the
    durable writes fail so callers can retry instead of believing success.
    """
    # -- 1. idempotency gate (Redis NX first; the local set is only a
    # fast-path AFTER a successful claim, so a DB failure below stays
    # retryable on this pod) -------------------------------------------
    claimed = True
    try:
        redis_client = _redis()
        claimed = await redis_client.set(
            FINALIZED_KEY.format(call_id=call_id),
            _utcnow_iso(),
            ex=FINALIZED_TTL_SECS,
            nx=True,
        )
    except Exception as exc:  # noqa: BLE001 - fail open, still try the writes
        log.warning("finalize marker write failed for call %s: %s", call_id, exc)
        claimed = True
    if not claimed:
        log.info("finalize already ran for call %s; skipping", call_id)
        return False
    if call_id in _local_finalized_calls:
        log.info("finalize already ran for call %s; skipping", call_id)
        return False

    # -- session context (tenant for the slot release) ----------------------
    session = await get_session(call_id)
    org_id = tenant_id or (session.org_id if session else None)
    agent = agent_id or (session.agent_id if session else None)
    log.info(
        "finalizing call %s (org=%s agent=%s outcome=%s duration_s=%d)",
        call_id, org_id, agent, outcome, duration_seconds,
    )

    # -- 2. concurrency slot (exactly once per acquire) ---------------------
    if org_id:
        try:
            from config import release_concurrency_slot

            await release_concurrency_slot(org_id, call_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("slot release failed for call %s: %s", call_id, exc)

    # -- 3+4. durable MongoDB writes: failures are LOUD and return False so
    # callers (status-callback, internal endpoint) can retry instead of
    # believing the call settled -----------------------------------------
    writes_ok = False
    try:
        from providers.errors import with_provider_retry

        def _writes() -> None:
            client = _mongo_database()
            status = _terminal_status_for(outcome)
            ended_at = _utcnow_iso()
            from bson import ObjectId
            filter_q = {"_id": ObjectId(call_id)} if ObjectId.is_valid(call_id) else {"_id": call_id}
            call_doc = client.calls.find_one(filter_q)
            if not call_doc:
                call_doc = client.calls.find_one({"providerCallId": call_id})
            if not call_doc:
                raise RuntimeError(f"call row not found for {call_id}")
            # Pin every subsequent write to the ACTUAL document id — the
            # guessed _id form above may differ in type (ObjectId vs str)
            # from what Mongo stored, which previously made updates match
            # zero documents while reporting success.
            filter_q = {"_id": call_doc["_id"]}

            from datetime import datetime, timezone
            now_dt = datetime.now(timezone.utc)
            mongo_patch = {
                "status": status.upper(),
                "durationSeconds": max(0, int(duration_seconds)),
                "outcome": (disposition or outcome)[:200],
                "endedAt": now_dt,
                "updatedAt": now_dt,
            }
            if summary:
                mongo_patch["summary"] = summary[:2000]
            if recording_data:
                mongo_patch["recording"] = recording_data
                if recording_data.get("url"):
                    mongo_patch["metadata.recordingUrl"] = recording_data["url"]
            # Plivo's signed status webhook is authoritative for terminal
            # provider outcomes and billable duration. A WebSocket close
            # racing that webhook must not turn BUSY/FAILED/NO_ANSWER
            # back into COMPLETED.
            client.calls.update_one(
                {
                    **filter_q,
                    "status": {
                        "$nin": [
                            "COMPLETED",
                            "FAILED",
                            "BUSY",
                            "NO_ANSWER",
                            "CANCELLED",
                        ]
                    },
                },
                {"$set": mongo_patch},
            )

            if recording_data and call_doc and recording_data.get("status") in ("completed", "ready"):
                rec_doc = {
                    "callId": call_doc["_id"],
                    "organizationId": call_doc["organizationId"],
                    "storageProvider": recording_data.get("storageProvider", "gcs"),
                    "bucket": recording_data.get("bucket", ""),
                    "objectKey": recording_data.get("objectPath", ""),
                    "durationSeconds": int(recording_data.get("durationSeconds", duration_seconds)),
                    "format": "audio/wav",
                    "sizeBytes": int(recording_data.get("sizeBytes", 0)),
                    "status": "ready",
                    "updatedAt": now_dt,
                }
                rec_res = client.recordings.update_one(
                    {"callId": call_doc["_id"]},
                    {"$set": rec_doc, "$setOnInsert": {"createdAt": now_dt}},
                    upsert=True,
                )
                rec_id = rec_res.upserted_id
                if not rec_id:
                    existing_rec = client.recordings.find_one({"callId": call_doc["_id"]})
                    if existing_rec:
                        rec_id = existing_rec["_id"]
                if rec_id:
                    client.calls.update_one(filter_q, {"$set": {"recordingId": rec_id}})

            if transcript and call_doc:
                segments = [
                    {"speaker": t.get("role", "user"), "text": t.get("content") or t.get("text", ""), "timestampMs": 0}
                    for t in transcript
                ]
                client.transcripts.update_one(
                    {"callId": call_doc["_id"]},
                    {"$set": {"organizationId": call_doc["organizationId"], "segments": segments, "updatedAt": now_dt}},
                    upsert=True,
                )
            if org_id and call_doc:
                try:
                    client.call_events.insert_one({
                        "organizationId": call_doc["organizationId"],
                        "callId": call_doc["_id"],
                        "type": "finalized",
                        "provider_event_id": f"finalized:{call_id}",
                        "idempotencyKey": f"finalized:{call_id}",
                        "data": {
                            "outcome": disposition or outcome,
                            "durationSeconds": duration_seconds,
                            "agentId": str(call_doc.get("agentId", "")),
                            "hasTranscript": bool(transcript),
                            "hasSummary": bool(summary),
                            "hasRecording": bool(recording_data and recording_data.get("status") == "completed"),
                        },
                        "timestamp": now_dt,
                    })
                except Exception as exc:  # noqa: BLE001 - duplicate redelivery
                    if "duplicate" in str(exc).lower() or "11000" in str(exc):
                        log.info("finalized event already recorded for call %s", call_id)
                    else:
                        raise

        import asyncio as _asyncio

        await with_provider_retry(
            lambda: _asyncio.to_thread(_writes),
            provider="mongodb",
            max_attempts=3,
            operation="finalize_call.db_writes",
        )
        writes_ok = True
    except Exception as exc:  # noqa: BLE001 - durability degraded, report failure
        log.error("durable finalize writes failed for call %s: %s", call_id, exc)
        return False

    # Mark locally finalized ONLY after durable success (bounded set).
    _local_finalized_calls.add(call_id)
    if len(_local_finalized_calls) > _LOCAL_FINALIZED_CAP:
        _local_finalized_calls.clear()

    # -- 5. session hygiene ----------------------------------------------------
    await delete_session(call_id)
    return writes_ok


__all__ = [
    "FINALIZED_KEY",
    "SESSION_KEY",
    "SessionStatus",
    "VoiceSession",
    "create_session",
    "delete_session",
    "finalize_call",
    "get_session",
    "heartbeat",
    "is_finalized",
]
