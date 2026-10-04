"""Structured context logging + in-memory metrics + readiness checks (LiveKit).

Logging: :class:`JsonFormatter` emits one JSON object per line with the
``service`` name plus the current call context (``call_id``, ``tenant_id``,
``agent_id``). Metrics: process-local counters/gauges with a Prometheus text
renderer. Readiness probes LiveKit + Redis + Mongo + provider keys.

Log/alert formats are unchanged from the legacy-rtc era so dashboards keep
working (`sigulon_runtime_*`, `[voice-latency]`, `[redis]`, ...).
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
        for key in ("outcome", "duration_s", "provider", "event"):
            if hasattr(record, key):
                obj[key] = getattr(record, key)
        if record.exc_info:
            obj["exc"] = self.formatException(record.exc_info)
        return json.dumps(obj, ensure_ascii=False)


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
        rendered = int(value) if float(value).is_integer() else value
        lines.append(f'sigulon_runtime_{name} {rendered}')
    uptime = int(time.monotonic() - _started_at)
    lines.append("# HELP sigulon_runtime_uptime_seconds Process uptime.")
    lines.append("# TYPE sigulon_runtime_uptime_seconds counter")
    lines.append(f"sigulon_runtime_uptime_seconds {uptime}")
    return "\n".join(lines) + "\n"


def log_metrics(metrics: Any) -> None:
    """Log an Agents SDK MetricsCollectedEvent payload (dashboard-compatible)."""
    try:
        mtype = getattr(metrics, "type", type(metrics).__name__)
        logging.getLogger("voice-runtime.observability").info(
            "[voice-metrics] type=%s payload=%s",
            mtype,
            str(metrics)[:500],
        )
        inc(f"metrics_{mtype}")
    except Exception:  # noqa: BLE001 - metrics never break audio
        pass


async def check_readiness() -> dict[str, Any]:
    """Probe runtime dependencies. Never raises — failures become check rows."""
    checks: dict[str, dict[str, Any]] = {}

    try:
        from config import get_redis

        pong = await get_redis().ping()
        checks["redis"] = {"ok": bool(pong)}
        if pong:
            logging.getLogger("voice-runtime.observability").info("[redis] ping successful")
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = {"ok": False, "error": str(exc)[:200]}

    try:
        from config import ping_mongodb

        checks["mongodb"] = {"ok": bool(await ping_mongodb())}
    except Exception as exc:  # noqa: BLE001
        checks["mongodb"] = {"ok": False, "error": str(exc)[:200]}

    livekit_ok = bool(os.getenv("LIVEKIT_URL")) and bool(os.getenv("LIVEKIT_API_KEY")) and bool(
        os.getenv("LIVEKIT_API_SECRET")
    )
    deepgram_ok = bool(os.getenv("DEEPGRAM_API_KEY")) or livekit_ok
    cartesia_ok = bool(os.getenv("CARTESIA_API_KEY"))
    openrouter_ok = bool(os.getenv("OPENROUTER_API_KEY"))
    checks["livekit"] = {"ok": livekit_ok}
    if not livekit_ok:
        checks["livekit"]["error"] = "LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET not configured"
    checks["deepgram_stt"] = {"ok": deepgram_ok}
    checks["cartesia_tts"] = {"ok": cartesia_ok}
    if not cartesia_ok:
        checks["cartesia_tts"]["error"] = "CARTESIA_API_KEY not configured"
    checks["openrouter"] = {
        "ok": openrouter_ok,
        "model": (os.getenv("OPENROUTER_MODEL", "") or "").strip() or "fallback: livekit-inference",
    }
    if not openrouter_ok:
        checks["openrouter"]["error"] = "OPENROUTER_API_KEY not configured (fallback LLM only)"

    overall_ok = bool(
        checks["redis"]["ok"]
        and checks["mongodb"]["ok"]
        and checks["livekit"]["ok"]
        and checks["cartesia_tts"]["ok"]
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
    "log_metrics",
    "render_prometheus",
    "set_gauge",
    "snapshot",
]
