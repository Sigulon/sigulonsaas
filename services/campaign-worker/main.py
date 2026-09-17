"""Campaign worker entrypoint: pop jobs, dial, sweep, heartbeat, repeat.

Runs until SIGTERM/SIGINT. Blocking pops use a short timeout so shutdown
and sweeps stay prompt. One process, one loop — scale by running more
replicas (the Lua governors + ZSET claims + sticky terminals keep N
workers correct).
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import time

import config as config_mod
import queueing as queueing_mod
import worker as worker_mod

_stop = False


def _handle_stop(signum, _frame) -> None:  # noqa: ANN001, ANN202
    global _stop
    logging.getLogger("campaign-worker").info(
        "received signal %s — finishing current job then exiting", signum
    )
    _stop = True


def _setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        '{"time": "%(asctime)s", "level": "%(levelname)s", '
        '"service": "campaign-worker", "msg": %(message)s}',
        datefmt="%Y-%m-%dT%H:%M:%S",
    ))

    class _JsonMsg(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            record.msg = json.dumps(str(record.msg), ensure_ascii=False)
            return True

    handler.addFilter(_JsonMsg())
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]


def _clients(cfg):
    try:
        import redis
    except ImportError as exc:
        raise RuntimeError("The 'redis' package is required.") from exc
    try:
        from pymongo import MongoClient
    except ImportError as exc:
        raise RuntimeError("The 'pymongo' package is required.") from exc
    mongo = MongoClient(
        cfg.mongodb_uri,
        maxPoolSize=50,
        minPoolSize=1,
        serverSelectionTimeoutMS=1_000,
        connectTimeoutMS=1_000,
        socketTimeoutMS=3_000,
        retryReads=True,
        retryWrites=True,
    )
    try:
        db = mongo.get_default_database()
    except Exception:
        db = mongo["sigulon"]
    redis_client = redis.Redis.from_url(
        cfg.redis_url,
        decode_responses=True,
        socket_connect_timeout=0.5,
        socket_timeout=1.0,
        retry_on_timeout=False,
    )
    # Do not let a running worker silently drop every job while an external
    # dependency is unreachable. Fail startup instead and let orchestration
    # surface a clear unhealthy deployment.
    redis_client.ping()
    db.command("ping")
    return redis_client, db


def run() -> int:
    _setup_logging()
    log = logging.getLogger("campaign-worker")
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)

    try:
        cfg = config_mod.load_config()
    except RuntimeError as exc:
        log.error("bad config: %s", exc)
        return 2

    try:
        redis_client, database = _clients(cfg)
    except Exception as exc:  # noqa: BLE001 - dependency startup is fatal
        log.error("dependency startup check failed: %s", exc)
        return 2
    ctx = worker_mod.WorkerContext(config=cfg, redis=redis_client, database=database)
    log.info(
        "campaign worker starting (poll=%ds sweep=%ds max_attempts=%d)",
        cfg.poll_timeout_seconds, cfg.sweep_interval_seconds, cfg.max_call_attempts,
    )

    last_sweep = 0.0
    processed = 0
    while not _stop:
        try:
            item = redis_client.brpop(queueing_mod.QUEUE_KEY, timeout=cfg.poll_timeout_seconds)
        except Exception as exc:  # noqa: BLE001 - Redis blip, back off briefly
            log.warning("queue pop failed: %s", exc)
            time.sleep(2)
            continue
        if item:
            _, raw = item
            job = queueing_mod.decode_job(raw)
            if job is not None:
                disposition = worker_mod.process_job(ctx, job)
                processed += 1
                log.info("job done (%s) contact=%s", disposition, job["contact_id"])

        for job in queueing_mod.claim_due_retries(ctx.redis, cfg.retry_batch_size):
            if _stop:
                break
            disposition = worker_mod.process_job(ctx, job)
            processed += 1
            log.info("retry done (%s) contact=%s", disposition, job["contact_id"])

        if time.monotonic() - last_sweep >= cfg.sweep_interval_seconds:
            last_sweep = time.monotonic()
            worker_mod.run_sweeps(ctx)

        queueing_mod.heartbeat(redis_client)

    log.info("campaign worker stopped (processed=%d)", processed)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
