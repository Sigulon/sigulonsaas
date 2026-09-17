"""Job processing + sweeps. All politics live here; `main.py` just loops.

Dispositions (returned per job, for logs):
  dialed | retry_scheduled | terminal:<status> | dropped | paused

Crash safety: every exit path either dials, reschedules, or terminalizes.
The sweep heals whatever the loop drops (lost jobs, dead dials, missed
webhooks) and completes drained campaigns — so every contact in a running
campaign converges to a terminal state with no operator input.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import config as config_mod  # noqa: F401 - re-exported for worker consumers
import credentials as credentials_mod
import dialer as dialer_mod
import phone as phone_mod
import queueing as queueing_mod
import store as store_mod

log = logging.getLogger("campaign-worker.worker")

CALL_TERMINAL_MIRROR = {
    "completed": "completed",
    "failed": "failed",
    "busy": "busy",
    "no_answer": "no_answer",
}
CALL_ACTIVE = ("dialing", "calling", "ringing")
DISPATCH_BATCH_SIZE = 500


@dataclass
class WorkerContext:
    config: Any
    redis: Any
    database: Any


def retry_delay_seconds(base_seconds: float, failures: int, cap: float = 86400.0) -> float:
    """Backoff after `failures` failed dial attempts (>= 1)."""
    return min(base_seconds * (2 ** max(0, failures - 1)), cap)


def _crash_count(ctx: WorkerContext, job: dict[str, Any]) -> int:
    key = f"sigulon:job:crash:{job['org_id']}:{job['contact_id']}"
    try:
        count = int(ctx.redis.incr(key))
        if count == 1:
            ctx.redis.expire(key, 3600)
        return count
    except Exception:  # noqa: BLE001
        return 1


def _slot_layers(ctx: WorkerContext, job: dict[str, Any], number_digits: str):
    cfg = ctx.config
    layers = [
        ("sigulon:conc:global", cfg.global_max_concurrent, cfg.global_slot_ttl),
        (f"sigulon:conc:org:{job['org_id']}", _org_limit(ctx, job), cfg.org_slot_ttl),
    ]
    if job.get("campaign_id"):
        layers.append((
            f"sigulon:conc:campaign:{job['campaign_id']}",
            cfg.campaign_max_concurrent, cfg.campaign_slot_ttl,
        ))
    layers.append((
        f"sigulon:conc:number:{number_digits[-10:]}",
        cfg.number_max_concurrent, cfg.number_slot_ttl,
    ))
    return layers


def _org_limit(ctx: WorkerContext, job: dict[str, Any]) -> int:
    """Per-org dial governor: plan limit when known, else the global cap."""
    try:
        if callable(getattr(ctx.database, "table", None)):
            row = (
                ctx.database.table("organizations")
                .select("max_concurrent_calls")
                .eq("id", job["org_id"])
                .maybe_single()
                .execute()
            ).data or {}
        else:
            from bson import ObjectId
            org_id = str(job["org_id"])
            filter_q = {"_id": ObjectId(org_id)} if ObjectId.is_valid(org_id) else {"_id": org_id}
            doc = ctx.database.organizations.find_one(filter_q) or {}
            row = {"max_concurrent_calls": doc.get("maxConcurrentCalls")}
        return int(row.get("max_concurrent_calls") or ctx.config.global_max_concurrent)
    except Exception:  # noqa: BLE001
        return ctx.config.global_max_concurrent


def process_job(ctx: WorkerContext, job: dict[str, Any]) -> str:
    """Process one dial job to a disposition (never raises)."""
    try:
        return _process_job(ctx, job)
    except Exception as exc:  # noqa: BLE001 - crash loop guard, never fatal
        log.exception("job crashed (org=%s contact=%s)", job.get("org_id"), job.get("contact_id"))
        crashes = _crash_count(ctx, job)
        if job.get("campaign_id") and crashes <= 5:
            store_mod.set_contact_status(
                ctx.database, job["campaign_id"], job["contact_id"], "pending",
                next_attempt_at=_iso_in(60),
            )
            queueing_mod.schedule_retry(ctx.redis, job, 60)
            return "retry_scheduled"
        # Singles and repeat crashers terminalize instead of looping forever.
        if job.get("campaign_id"):
            store_mod.set_contact_status(
                ctx.database, job["campaign_id"], job["contact_id"], "failed"
            )
            return "terminal:failed"
        log.error("single-dial job crashed repeatedly, dropping: %s", exc)
        return "dropped"


def _process_job(ctx: WorkerContext, job: dict[str, Any]) -> str:
    cfg = ctx.config
    campaign = (
        store_mod.get_campaign(ctx.database, job["campaign_id"])
        if job.get("campaign_id")
        else None
    )
    if job.get("campaign_id"):
        if campaign is None:
            log.warning("dropping job for missing campaign %s", job["campaign_id"])
            return "dropped"
        if campaign.get("org_id") != job["org_id"]:
            log.error("org mismatch on job for campaign %s; dropping", job["campaign_id"])
            return "dropped"
        if campaign.get("status") != "running":
            # Paused/completed mid-flight: park the contact, don't dial.
            cc = store_mod.get_campaign_contact(
                ctx.database, job["campaign_id"], job["contact_id"]
            )
            if cc and cc.get("call_status") == "queued":
                store_mod.set_contact_status(
                    ctx.database, job["campaign_id"], job["contact_id"], "pending"
                )
            return "paused"

    contact = store_mod.get_contact(ctx.database, job["contact_id"])
    if contact is None or contact.get("org_id") != job["org_id"]:
        log.warning("dropping job for missing/foreign contact %s", job["contact_id"])
        return "dropped"

    # Load the exact web-created single-dial row before any preflight
    # terminalization. Otherwise an exhausted/DNC single call would be left
    # queued forever because `_terminal` did not yet know which row to close.
    single_call: Optional[dict] = None
    if not job.get("campaign_id"):
        single_call = store_mod.latest_queued_call(
            ctx.database, job["org_id"], job["contact_id"], job.get("single_call_id")
        )
        if single_call is None:
            log.info("single-dial row gone for contact %s; dropping", job["contact_id"])
            return "dropped"

    cc = (
        store_mod.get_campaign_contact(ctx.database, job["campaign_id"], job["contact_id"])
        if job.get("campaign_id")
        else None
    )
    attempts = int((cc or {}).get("attempt_count") or job.get("attempt", 0))
    max_attempts = max(1, int(job.get("max_attempts") or cfg.max_call_attempts))
    if attempts >= max_attempts:
        return _terminal(ctx, job, cc, single_call, "failed", "attempts-exhausted")

    normalized = contact.get("normalized_phone") or phone_mod.normalize_phone(
        contact.get("phone_number")
    )
    if contact.get("do_not_call") or (
        normalized and store_mod.is_dnc(ctx.database, job["org_id"], normalized)
    ):
        return _terminal(ctx, job, cc, single_call, "dnc", "dnc-listed")

    to_e164 = normalized
    if not to_e164:
        return _terminal(ctx, job, cc, single_call, "skipped", "unparseable-number")

    # Agent: campaign's for batch jobs; the queued row's for single dials.
    if job.get("campaign_id"):
        agent_id = (campaign or {}).get("agent_id")
    else:
        agent_id = single_call.get("agent_id")

    agent = store_mod.get_agent(ctx.database, agent_id) if agent_id else None
    if (
        agent is None
        or agent.get("status") != "active"
        or agent.get("org_id") != job["org_id"]
    ):
        return _terminal(ctx, job, cc, single_call, "failed", "no-agent")

    number = store_mod.get_outbound_number(ctx.database, job["org_id"])
    if number is None:
        return _terminal(ctx, job, cc, single_call, "failed", "no-from-number")

    plivo_credentials = credentials_mod.get_plivo_credentials(
        ctx.database,
        job["org_id"],
        platform_auth_id=cfg.plivo_auth_id,
        platform_auth_token=cfg.plivo_auth_token,
        encryption_secret=cfg.encryption_secret,
    )
    if plivo_credentials is None:
        return _terminal(ctx, job, cc, single_call, "failed", "no-plivo-credentials")

    layers = _slot_layers(ctx, job, phone_mod.digits_of(number["phone_number"]))
    admitted, refusing = queueing_mod.acquire_layers(ctx.redis, layers)
    if not admitted:
        log.info("concurrency refused by %s; deferring contact %s", refusing, job["contact_id"])
        queueing_mod.schedule_retry(ctx.redis, job, 60)
        if cc is not None:
            store_mod.set_contact_status(
                ctx.database, job["campaign_id"], job["contact_id"], "queued",
                next_attempt_at=_iso_in(60),
            )
        return "retry_scheduled"
    layer_keys = [key for key, _, _ in layers]

    # Call row: campaign jobs mint one per dial; single dials reuse the row
    # the web route created (it carries the caller's metadata).
    if single_call is not None:
        call_id = single_call["id"]
    else:
        call_id = store_mod.insert_call(ctx.database, {
            "org_id": job["org_id"],
            "agent_id": agent["id"],
            "campaign_id": job["campaign_id"],
            "contact_id": job["contact_id"],
            "phone_number_id": number["id"],
            "cartesia_call_id": f"plivo:out:{uuid.uuid4().hex}",
            "provider": "plivo",
            "direction": "outbound",
            "to_number": contact.get("phone_number"),
            "from_number": number["phone_number"],
            "status": "queued",
            "duration_seconds": 0,
            "transcript": [],
            "metadata": {
                "normalized_to": to_e164,
                "attempt": attempts + 1,
                "source": "campaign-worker",
            },
        })
        if not call_id:
            queueing_mod.release_layers(ctx.redis, layer_keys)
            queueing_mod.schedule_retry(ctx.redis, job, 60)
            return "retry_scheduled"

    try:
        dial_result = dialer_mod.dial(
            auth_id=plivo_credentials["auth_id"],
            auth_token=plivo_credentials["auth_token"],
            from_number=number["phone_number"],
            to_number=to_e164,
            answer_url=dialer_mod.answer_url_for_call(cfg.public_web_url, call_id),
            hangup_url=dialer_mod.hangup_url(cfg.public_web_url, call_id),
            timeout_seconds=cfg.dial_timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001 - dial failures are routine
        queueing_mod.release_layers(ctx.redis, layer_keys)
        failures = attempts + 1
        log.warning("dial failed contact %s (%d/%d): %s",
                    job["contact_id"], failures, max_attempts, exc)
        # The minted row never reached the provider — fail it now so no
        # orphan `queued` call lingers. Retries mint a fresh row per attempt.
        store_mod.update_call(ctx.database, call_id, {"status": "failed"})
        if failures >= max_attempts:
            return _terminal(ctx, job, cc, single_call, "failed", f"dial-failed:{exc}")
        delay = retry_delay_seconds(cfg.retry_base_seconds, failures)
        queueing_mod.schedule_retry(ctx.redis, job, delay)
        if cc is not None:
            store_mod.set_contact_status(
                ctx.database, job["campaign_id"], job["contact_id"], "pending",
                attempt_count=failures, next_attempt_at=_iso_in(delay),
            )
        return "retry_scheduled"

    # Accepted: provider owns the call now; slots ride their TTLs.
    store_mod.update_call(ctx.database, call_id, {
        "status": "dialing",
        "metadata": {"plivo_request_uuid": dial_result.get("request_uuid")},
    })
    if cc is not None:
        store_mod.set_contact_status(
            ctx.database, job["campaign_id"], job["contact_id"], "dialing",
            attempt_count=attempts + 1,
        )
    store_mod.insert_call_event(
        ctx.database, org_id=job["org_id"], call_id=call_id,
        event="outbound.dialed",
        payload={"to": to_e164, "request_uuid": dial_result.get("request_uuid")},
    )
    log.info("dialed contact %s (call=%s)", job["contact_id"], call_id)
    return "dialed"


def _terminal(
    ctx: WorkerContext,
    job: dict[str, Any],
    cc: Optional[dict],
    single_call: Optional[dict],
    contact_status: str,
    reason: str,
) -> str:
    """Record a terminal outcome for a contact that will never be dialed."""
    log.info("contact %s terminal (%s): %s", job["contact_id"], contact_status, reason)
    if cc is not None and job.get("campaign_id"):
        store_mod.set_contact_status(
            ctx.database, job["campaign_id"], job["contact_id"], contact_status
        )
    elif single_call is not None:
        # Calls have no dnc/skipped states — cancelled + reason in metadata.
        store_mod.update_call(ctx.database, single_call["id"], {"status": "cancelled"})
    return f"terminal:{contact_status}"


# ---------------------------------------------------------------------------
# Sweeps (the convergence guarantee)
# ---------------------------------------------------------------------------


def sweep_campaign(ctx: WorkerContext, campaign_id: str, now: datetime) -> dict[str, int]:
    """Heal one running campaign. Returns counts by action taken."""
    cfg = ctx.config
    cutoff = (now - timedelta(seconds=cfg.stale_after_seconds)).isoformat()
    stats = {"requeued": 0, "healed": 0, "failed_stale": 0, "dispatched": 0}

    stale_queued = store_mod.stale_contacts(
        ctx.database, campaign_id, ("queued",), cutoff
    )
    for row in stale_queued:
        queueing_mod.schedule_retry(ctx.redis, {
            "campaign_id": campaign_id,
            "contact_id": row["contact_id"],
            "org_id": _campaign_org(ctx, campaign_id, row),
            "attempt": int(row.get("attempt_count") or 0),
        }, 0)
        # Restamp so the next sweep measures from this requeue, not the loss.
        store_mod.set_contact_status(
            ctx.database, campaign_id, row["contact_id"], "queued"
        )
        stats["requeued"] += 1

    stale_active = store_mod.stale_contacts(
        ctx.database, campaign_id, CALL_ACTIVE, cutoff
    )
    for row in stale_active:
        if _heal_stale_active(ctx, campaign_id, row):
            stats["healed"] += 1
        else:
            stats["failed_stale"] += 1

    # `/start` dispatches the first page. Once every row in that page has
    # settled (including retries), refill exactly one bounded page. Keeping
    # only one active page avoids creating a huge Redis backlog for campaigns
    # with thousands of contacts while guaranteeing they never stop at 500.
    stats["dispatched"] = _dispatch_next_batch(ctx, campaign_id)

    remaining = store_mod.nonterminal_contact_count(ctx.database, campaign_id)
    if remaining == 0:
        if store_mod.complete_campaign(ctx.database, campaign_id):
            log.info("campaign %s drained — marked completed", campaign_id)
            stats["completed"] = 1
    return stats


def _campaign_org(ctx: WorkerContext, campaign_id: str, _row: dict) -> str:
    campaign = store_mod.get_campaign(ctx.database, campaign_id) or {}
    return str(campaign.get("org_id") or "")


def _dispatch_next_batch(ctx: WorkerContext, campaign_id: str) -> int:
    """Claim and enqueue the next unopened 500-contact page, if ready."""
    if store_mod.has_active_batch_work(ctx.database, campaign_id):
        return 0

    token = queueing_mod.acquire_dispatch_lock(ctx.redis, campaign_id)
    if token is None:
        return 0
    try:
        # The web starter or another worker could have changed state while we
        # waited for the lock, so check the source of truth again.
        campaign = store_mod.get_campaign(ctx.database, campaign_id)
        if campaign is None or campaign.get("status") != "running":
            return 0
        if store_mod.has_active_batch_work(ctx.database, campaign_id):
            return 0

        claimed = store_mod.claim_next_initial_batch(
            ctx.database, campaign_id, DISPATCH_BATCH_SIZE
        )
        if not claimed:
            return 0

        max_attempts = int((campaign.get("retry_config") or {}).get("max_attempts") or 0)
        jobs = [
            {
                "campaign_id": campaign_id,
                "contact_id": row["contact_id"],
                "org_id": campaign["org_id"],
                "attempt": row["attempt_count"],
                "max_attempts": max_attempts or ctx.config.max_call_attempts,
            }
            for row in claimed
        ]
        try:
            queueing_mod.enqueue_jobs(ctx.redis, jobs)
        except Exception:  # noqa: BLE001 - restore so the following sweep retries cleanly
            store_mod.restore_initial_batch_claims(
                ctx.database, campaign_id, [row["id"] for row in claimed]
            )
            raise
        log.info("campaign %s dispatched next batch (%d contacts)", campaign_id, len(jobs))
        return len(jobs)
    finally:
        queueing_mod.release_dispatch_lock(ctx.redis, campaign_id, token)


def _heal_stale_active(ctx: WorkerContext, campaign_id: str, row: dict) -> bool:
    """Reconcile a contact stuck mid-call: mirror a terminal call, else fail.

    Returns True when the contact left the active set (healed or failed).
    Webhook misses heal forward; truly dead dials terminalize. Either way
    the contact converges — the sweep never leaves it behind.
    """
    contact_id = row["contact_id"]
    previous = row.get("call_status")
    latest = store_mod.latest_call_for_contact(ctx.database, campaign_id, contact_id)
    if latest and latest.get("status") in CALL_TERMINAL_MIRROR:
        store_mod.set_contact_status(
            ctx.database, campaign_id, contact_id,
            CALL_TERMINAL_MIRROR[latest["status"]],
        )
        return True
    if latest and latest.get("status") not in ("completed", "failed", "busy",
                                               "no_answer", "cancelled", "voicemail"):
        store_mod.update_call(ctx.database, latest["id"], {"status": "failed"})
    store_mod.set_contact_status(ctx.database, campaign_id, contact_id, "failed")
    log.warning("contact %s stale in %s — terminalized as failed",
                contact_id, previous)
    return False


def run_sweeps(ctx: WorkerContext, now: Optional[datetime] = None) -> dict[str, int]:
    """Sweep every running campaign. Returns per-action totals."""
    now = now or datetime.now(timezone.utc)
    totals: dict[str, int] = {}
    for campaign_id in store_mod.running_campaign_ids(ctx.database):
        try:
            for action, count in sweep_campaign(ctx, campaign_id, now).items():
                totals[action] = totals.get(action, 0) + count
        except Exception as exc:  # noqa: BLE001 - one bad campaign can't stop the sweep
            log.exception("sweep failed for campaign %s", campaign_id)
    if any(totals.values()):
        log.info("sweep totals: %s", totals)
    return totals


def _iso_in(seconds: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


__all__ = [
    "WorkerContext",
    "process_job",
    "retry_delay_seconds",
    "run_sweeps",
    "sweep_campaign",
]
