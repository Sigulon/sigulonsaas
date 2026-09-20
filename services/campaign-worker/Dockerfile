# Sigulon campaign worker: Redis queue -> Plivo dial.
# Long-running loop (no HTTP server) — run one+ replicas; see README.
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/campaign-worker

COPY pyproject.toml uv.lock* requirements.txt ./
RUN if [ -f uv.lock ]; then \
      pip install --no-cache-dir uv && uv sync --frozen --no-dev --no-editable; \
    else \
      echo "WARNING: uv.lock absent — falling back to requirements.txt (may drift from pyproject)" >&2; \
      pip install --no-cache-dir -r requirements.txt; \
    fi
# requirements.txt remains as the documented pip fallback; uv.lock is the
# source of truth — regenerate requirements.txt whenever pyproject changes.

COPY config.py main.py worker.py queueing.py store.py dialer.py phone.py ./

RUN useradd --system --uid 1001 --create-home apprunner
USER apprunner
# Liveness is the Redis heartbeat key (sigulon:worker:campaign:heartbeat),
# touched every loop — no HTTP port to probe.
CMD ["python", "main.py"]
