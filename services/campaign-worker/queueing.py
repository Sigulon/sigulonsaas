"""Redis queue, retry schedule, dispatch locks, layered dial governors.

Key layout mirrors `src/lib/campaign-queue.ts` (plain JSON/strings both
sides can read)::

    sigulon:campaign:queue              LIST of job JSON
    sigulon:campaign:retries            ZSET member=job JSON score=due unix-ms
    sigulon:campaign:{id}:dispatch_lock serializes the web starter and worker
                                            batch refills for one campaign
    sigulon:conc:{global|org|...}       dial governor counters with TTLs

Job JSON has required campaign/contact/org/attempt identifiers plus optional
dial settings (single-call id, agent id, phone numbers, and max attempts).
Those optional fields must survive retry serialization so retries keep the
same call row and campaign-specific limits.

Layered concurrency is one Lua script (check-then-increment across all
layers atomically) so two workers can never both slip under a limit.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Optional

log = logging.getLogger("campaign-worker.queueing")

QUEUE_KEY = "sigulon:campaign:queue"
RETRY_ZSET = "sigulon:campaign:retries"
WORKER_HEARTBEAT_KEY = "sigulon:worker:campaign:heartbeat"


def dispatch_lock_key(campaign_id: str) -> str:
    return f"sigulon:campaign:{campaign_id}:dispatch_lock"


def acquire_dispatch_lock(
    redis_client: Any, campaign_id: str, ttl_seconds: int = 60
) -> Optional[str]:
    """Claim the per-campaign dispatcher lock and return its owner token.

    The Next.js start route uses the same key, so a refill cannot race the
    initial 500-job dispatch. A unique token makes releasing an expired lock
    safe: a slow worker cannot delete a newer worker's replacement lock.
    """
    token = uuid.uuid4().hex
    try:
        acquired = redis_client.set(
            dispatch_lock_key(campaign_id), token, nx=True, ex=ttl_seconds
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("dispatch-lock claim failed for %s: %s", campaign_id, exc)
        return None
    return token if acquired else None


def release_dispatch_lock(redis_client: Any, campaign_id: str, token: str) -> None:
    """Release only the lock instance this worker acquired."""
    try:
        key = dispatch_lock_key(campaign_id)
        if redis_client.get(key) == token:
            redis_client.delete(key)
    except Exception as exc:  # noqa: BLE001
        log.warning("dispatch-lock release failed for %s: %s", campaign_id, exc)


def conc_keys(
    *, org_id: str, campaign_id: Optional[str], number_digits: str
) -> list[str]:
    keys = ["sigulon:conc:global", f"sigulon:conc:org:{org_id}"]
    if campaign_id:
        keys.append(f"sigulon:conc:campaign:{campaign_id}")
    keys.append(f"sigulon:conc:number:{number_digits[-10:]}")
    return keys


# Returns 0 when every layer admitted, else the 1-based index of the layer
# that refused. ARGV = limit1, ttl1, limit2, ttl2, ...
ACQUIRE_SCRIPT = """
local n = #KEYS
for i = 1, n do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count >= tonumber(ARGV[(i-1)*2+1]) then return i end
end
for i = 1, n do
  redis.call('INCR', KEYS[i])
  redis.call('EXPIRE', KEYS[i], tonumber(ARGV[(i-1)*2+2]))
end
return 0
"""


def acquire_layers(
    redis_client: Any, layers: list[tuple[str, int, int]]
) -> tuple[bool, Optional[str]]:
    """Atomically admit across ``[(key, limit, ttl)]`` layers.

    Returns ``(True, None)`` on admission, else ``(False, refusing_key)``.
    """
    if not layers:
        return True, None
    keys = [key for key, _, _ in layers]
    args: list[Any] = []
    for _, limit, ttl in layers:
        args.extend([limit, ttl])
    refused = int(redis_client.eval(ACQUIRE_SCRIPT, len(keys), *(keys + args)))
    if refused:
        return False, keys[refused - 1]
    return True, None


def release_layers(redis_client: Any, keys: list[str]) -> None:
    """Best-effort slot release (failures only — success rides the TTL)."""
    try:
        pipe = redis_client.pipeline()
        for key in keys:
            pipe.decr(key)
        pipe.execute()
    except Exception as exc:  # noqa: BLE001 - governor hygiene, never fatal
        log.warning("slot release failed: %s", exc)


def encode_job(job: dict[str, Any]) -> str:
    payload: dict[str, Any] = {
        "campaign_id": job.get("campaign_id"),
        "contact_id": str(job["contact_id"]),
        "org_id": str(job["org_id"]),
        "attempt": int(job.get("attempt", 0)),
    }
    for key in ("agent_id", "single_call_id", "normalized_phone", "caller_number"):
        if job.get(key):
            payload[key] = str(job[key])
    if job.get("max_attempts") is not None:
        payload["max_attempts"] = int(job["max_attempts"])
    return json.dumps(payload, sort_keys=True)


def decode_job(raw: Any) -> Optional[dict[str, Any]]:
    """Parse + validate a queue payload. None = poison, ack-and-drop."""
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        job = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        log.warning("dropping unparsable job payload: %s", exc)
        return None
    if (
        not isinstance(job, dict)
        or not job.get("contact_id")
        or not job.get("org_id")
    ):
        log.warning("dropping malformed job payload: %r", raw)
        return None
    normalized: dict[str, Any] = {
        "campaign_id": job.get("campaign_id"),
        "contact_id": str(job["contact_id"]),
        "org_id": str(job["org_id"]),
        "attempt": int(job.get("attempt", 0)),
    }
    for key in ("agent_id", "single_call_id", "normalized_phone", "caller_number"):
        if job.get(key):
            normalized[key] = str(job[key])
    if job.get("max_attempts") is not None:
        try:
            normalized["max_attempts"] = max(1, int(job["max_attempts"]))
        except (TypeError, ValueError):
            log.warning("dropping malformed max_attempts from job: %r", raw)
    return normalized


def schedule_retry(
    redis_client: Any, job: dict[str, Any], delay_seconds: float
) -> None:
    """Park a job on the retry ZSET for ``delay_seconds`` from now."""
    due_ms = int((time.time() + max(0.0, delay_seconds)) * 1000)
    redis_client.zadd(RETRY_ZSET, {encode_job(job): due_ms})


def enqueue_jobs(redis_client: Any, jobs: list[dict[str, Any]]) -> int:
    """Atomically append a batch of jobs to the worker queue."""
    if not jobs:
        return 0
    payloads = [encode_job(job) for job in jobs]
    redis_client.rpush(QUEUE_KEY, *payloads)
    return len(payloads)


def claim_due_retries(redis_client: Any, limit: int) -> list[dict[str, Any]]:
    """Pop due retries (multi-worker safe: only process what ZREM removes)."""
    now_ms = int(time.time() * 1000)
    try:
        members = redis_client.zrangebyscore(RETRY_ZSET, 0, now_ms, start=0, num=limit)
    except Exception as exc:  # noqa: BLE001
        log.warning("retry scan failed: %s", exc)
        return []
    claimed: list[dict[str, Any]] = []
    for member in members or []:
        try:
            if redis_client.zrem(RETRY_ZSET, member):
                job = decode_job(member)
                if job is not None:
                    claimed.append(job)
        except Exception as exc:  # noqa: BLE001
            log.warning("retry claim failed: %s", exc)
    return claimed


def heartbeat(redis_client: Any, ttl_seconds: int = 60) -> None:
    try:
        redis_client.set(WORKER_HEARTBEAT_KEY, str(int(time.time())), ex=ttl_seconds)
    except Exception as exc:  # noqa: BLE001
        log.warning("heartbeat write failed: %s", exc)


__all__ = [
    "ACQUIRE_SCRIPT",
    "QUEUE_KEY",
    "RETRY_ZSET",
    "WORKER_HEARTBEAT_KEY",
    "acquire_layers",
    "acquire_dispatch_lock",
    "claim_due_retries",
    "conc_keys",
    "decode_job",
    "dispatch_lock_key",
    "enqueue_jobs",
    "encode_job",
    "heartbeat",
    "release_layers",
    "release_dispatch_lock",
    "schedule_retry",
]
