# Sigulon voice worker: LiveKit Agents 1.x (outbound-only, no HTTP ingress).
# Media is carried by LiveKit Cloud; this process only sees frames via the SDK.
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/voice-runtime

# System deps for audio/VAD wheels (onnxruntime).
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock* ./
RUN if [ -f uv.lock ]; then \
      pip install --no-cache-dir uv && uv sync --frozen --no-dev --no-editable; \
    else \
      echo "WARNING: uv.lock absent — falling back to requirements.txt (may drift from pyproject)" >&2; \
      pip install --no-cache-dir -r requirements.txt; \
    fi
# requirements.txt remains as the documented pip fallback; uv.lock is the
# source of truth — regenerate requirements.txt whenever pyproject changes.

COPY agent.py config.py postcall.py billing.py observability.py auth.py language.py latency.py ./
COPY providers/ ./providers/
COPY tools/ ./tools/

RUN useradd --system --uid 1001 --create-home apprunner
USER apprunner
# No EXPOSE / HTTP healthcheck: the worker is outbound-only (LiveKit dispatch).
# Liveness is the Agents SDK registration ("registered agent sigulon-voice-agent").
CMD ["python", "agent.py", "start"]
