"""Structured context logging + in-memory metrics + readiness checks.

Logging: :class:`JsonFormatter` emits one JSON object per line with the
``service`` name plus the current call context (``call_id``, ``tenant_id``,
``agent_id``) from :mod:`contextvars`. :func:`bind_call_context` sets it at
the top of the WebSocket handler; everything logged deeper in the call
automatically carries it — no ``extra={}`` plumbing.

Metrics: process-local counters/gauges with a Prometheus text renderer at
``GET /metrics``. Multi-replica aggregation is a Phase 9 concern; per-pod
counters are enough to alert on today.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import threading
import time
from typing import Any

SERVICE_NAME = "voice-runtime"

_call_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "voice_call_id", default=None
)
_tenant_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "voice_tenant_id", default=None
)
_agent_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "voice_agent_id", default=None
)


def bind_call_context(
    *,
    call_id: str | None = None,
    tenant_id: str | None = None,
    agent_id: str | None = None,
) -> None:
    """Attach call context to the current async task (logging + tracing)."""
    if call_id is not None:
        _call_id.set(call_id)
    if tenant_id is not None:
        _tenant_id.set(tenant_id)
    if agent_id is not None:
        _agent_id.set(agent_id)


def clear_call_context() -> None:
    _call_id.set(None)
    _tenant_id.set(None)
    _agent_id.set(None)


def current_call_context() -> dict[str, str | None]:
    return {
        "call_id": _call_id.get(),
        "tenant_id": _tenant_id.get(),
        "agent_id": _agent_id.get(),
    }


class JsonFormatter(logging.Formatter):
    """One JSON object per line, enriched with the active call context."""

    def format(self, record: logging.LogRecord) -> str:
        obj: dict[str, Any] = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "service": SERVICE_NAME,
            "msg": record.getMessage(),
        }
        ctx = current_call_context()
        for key, value in ctx.items():
            if value is not None:
                obj[key] = value
        # Explicit extras (e.g. duration_s) ride along without clobbering ctx.
        for key in ("outcome", "duration_s", "provider", "event"):
            if hasattr(record, key):
                obj[key] = getattr(record, key)
        if record.exc_info:
            obj["exc"] = self.formatException(record.exc_info)
        return json.dumps(obj, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_counters: dict[str, float] = {}
_started_at = time.monotonic()


def inc(metric: str, amount: float = 1.0) -> None:
    """Increment a monotonically-increasing counter."""
    with _lock:
        _counters[metric] = _counters.get(metric, 0.0) + amount


def set_gauge(metric: str, value: float) -> None:
    """Set a point-in-time gauge (e.g. active calls)."""
    with _lock:
        _counters[metric] = value


def snapshot() -> dict[str, float]:
    with _lock:
        return dict(_counters)


def render_prometheus() -> str:
    """Render counters in Prometheus exposition format."""
    lines = [
        "# HELP sigulon_runtime_calls_total Voice calls observed by outcome.",
        "# TYPE sigulon_runtime_calls_total counter",
    ]
    with _lock:
        items = sorted(_counters.items())
    for name, value in items:
        if name.startswith("calls_"):
            rendered = int(value) if float(value).is_integer() else value
            lines.append(f'sigulon_runtime_{name} {rendered}')
        else:
            rendered = int(value) if float(value).is_integer() else value
            lines.append(f'sigulon_runtime_{name} {rendered}')
    uptime = int(time.monotonic() - _started_at)
    lines.append("# HELP sigulon_runtime_uptime_seconds Process uptime.")
    lines.append("# TYPE sigulon_runtime_uptime_seconds counter")
    lines.append(f"sigulon_runtime_uptime_seconds {uptime}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Readiness
# ---------------------------------------------------------------------------


async def check_readiness() -> dict[str, Any]:
    """Probe runtime dependencies. Never raises — failures become check rows."""
    checks: dict[str, dict[str, Any]] = {}

    # Redis is required for distributed concurrency admission. Cache/session
    # reads themselves degrade quickly, but readiness is correctly degraded.
    try:
        from config import get_redis

        pong = await get_redis().ping()
        checks["redis"] = {"ok": bool(pong)}
        if pong:
            logging.getLogger("voice-runtime.observability").info("[redis] ping successful")
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = {"ok": False, "error": str(exc)[:200]}

    # MongoDB is the source of truth; verify the existing pooled client.
    try:
        from config import ping_mongodb

        checks["mongodb"] = {"ok": bool(await ping_mongodb())}
    except Exception as exc:  # noqa: BLE001
        checks["mongodb"] = {"ok": False, "error": str(exc)[:200]}

    # The runtime's fixed provider stack requires these two keys.
    cartesia_ok = bool(os.getenv("CARTESIA_API_KEY"))
    openrouter_ok = bool(os.getenv("OPENROUTER_API_KEY"))
    plivo_ok = bool(os.getenv("PLIVO_AUTH_ID")) and bool(os.getenv("PLIVO_AUTH_TOKEN"))
    checks["cartesia_stt"] = {"ok": cartesia_ok}
    checks["cartesia_tts"] = {"ok": cartesia_ok}
    checks["openrouter"] = {"ok": openrouter_ok, "model": "google/gemini-2.5-flash"}
    checks["plivo"] = {"ok": plivo_ok}
    for name, is_ok, required in (
        ("cartesia_stt", cartesia_ok, "CARTESIA_API_KEY"),
        ("cartesia_tts", cartesia_ok, "CARTESIA_API_KEY"),
        ("openrouter", openrouter_ok, "OPENROUTER_API_KEY"),
        ("plivo", plivo_ok, "PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN"),
    ):
        if not is_ok:
            checks[name]["error"] = f"{required} not configured"

    overall_ok = bool(
        checks["redis"]["ok"]
        and checks["mongodb"]["ok"]
        and checks["cartesia_stt"]["ok"]
        and checks["cartesia_tts"]["ok"]
        and checks["openrouter"]["ok"]
        and checks["plivo"]["ok"]
    )
    return {
        "status": "ok" if overall_ok else "degraded",
        "service": SERVICE_NAME,
        "checks": checks,
        "metrics": snapshot(),
    }


__all__ = [
    "JsonFormatter",
    "bind_call_context",
    "check_readiness",
    "clear_call_context",
    "current_call_context",
    "inc",
    "render_prometheus",
    "set_gauge",
    "snapshot",
]
