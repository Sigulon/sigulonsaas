# Sigulon campaign worker: Redis queue -> Plivo dial.
# Long-running loop (no HTTP server) — run one+ replicas; see README.
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/campaign-worker

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py main.py worker.py queueing.py store.py dialer.py phone.py ./

RUN useradd --system --uid 1001 --create-home apprunner
USER apprunner
# Liveness is the Redis heartbeat key (sigulon:worker:campaign:heartbeat),
# touched every loop — no HTTP port to probe.
CMD ["python", "main.py"]
