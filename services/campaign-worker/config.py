"""Campaign worker configuration (environment only — no secrets in code)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class WorkerConfig:
    mongodb_uri: str = ""
    redis_url: str = ""
    plivo_auth_id: str = ""
    plivo_auth_token: str = ""
    encryption_secret: str = ""
    public_web_url: str = ""  # answer_url / hangup_url base, e.g. https://app.example.com

    poll_timeout_seconds: int = 5
    retry_batch_size: int = 50
    sweep_interval_seconds: int = 120
    stale_after_seconds: int = 900  # 15 min without progress → heal/requeue
    max_call_attempts: int = 3
    retry_base_seconds: int = 300  # backoff = base * 2^failures

    global_max_concurrent: int = 50
    campaign_max_concurrent: int = 5
    number_max_concurrent: int = 2
    dial_timeout_seconds: int = 15

    # Slot TTLs: dial governors, not hard in-call locks (the voice runtime
    # owns the hard per-org gate). TTLs bound crash leaks by construction.
    global_slot_ttl: int = 300
    org_slot_ttl: int = 300
    campaign_slot_ttl: int = 300
    number_slot_ttl: int = 60


def load_config() -> WorkerConfig:
    """Read env. Raises RuntimeError listing every missing required var."""
    required = {
        "MONGODB_URI": os.getenv("MONGODB_URI", "").strip(),
        "REDIS_URL": os.getenv("REDIS_URL", "").strip(),
        "PUBLIC_WEB_URL": os.getenv("PUBLIC_WEB_URL", "").strip(),
    }
    missing = sorted(name for name, value in required.items() if not value)
    if missing:
        raise RuntimeError(
            f"Missing required env vars: {', '.join(missing)} "
            "(see .env.example)."
        )
    platform_auth_id = os.getenv("PLIVO_AUTH_ID", "")
    platform_auth_token = os.getenv("PLIVO_AUTH_TOKEN", "")
    if bool(platform_auth_id) != bool(platform_auth_token):
        raise RuntimeError("PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN must be set together.")
    return WorkerConfig(
        mongodb_uri=required["MONGODB_URI"],
        redis_url=required["REDIS_URL"],
        plivo_auth_id=platform_auth_id,
        plivo_auth_token=platform_auth_token,
        encryption_secret=os.getenv("ENCRYPTION_SECRET", ""),
        public_web_url=required["PUBLIC_WEB_URL"].rstrip("/"),
        poll_timeout_seconds=_int("WORKER_POLL_TIMEOUT_SECONDS", 5),
        retry_batch_size=_int("WORKER_RETRY_BATCH_SIZE", 50),
        sweep_interval_seconds=_int("WORKER_SWEEP_INTERVAL_SECONDS", 120),
        stale_after_seconds=_int("WORKER_STALE_AFTER_SECONDS", 900),
        max_call_attempts=_int("WORKER_MAX_CALL_ATTEMPTS", 3),
        retry_base_seconds=_int("WORKER_RETRY_BASE_SECONDS", 300),
        global_max_concurrent=_int("WORKER_GLOBAL_MAX_CONCURRENT", 50),
        campaign_max_concurrent=_int("WORKER_CAMPAIGN_MAX_CONCURRENT", 5),
        number_max_concurrent=_int("WORKER_NUMBER_MAX_CONCURRENT", 2),
        dial_timeout_seconds=_int("WORKER_DIAL_TIMEOUT_SECONDS", 15),
    )


__all__ = ["WorkerConfig", "load_config"]
