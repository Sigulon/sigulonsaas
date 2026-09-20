# Sigulon voice runtime: Pipecat + Cartesia + OpenRouter Gemini + Plivo.
# Long-lived telephony WebSockets — do NOT scale to zero in front of this.
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/voice-runtime

# System deps for audio/VAD wheels (onnxruntime) and healthchecks.
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

COPY config.py main.py pipeline.py postcall.py billing.py observability.py auth.py session.py ./
COPY providers/ ./providers/
COPY serializers/ ./serializers/
COPY tools/ ./tools/

RUN useradd --system --uid 1001 --create-home apprunner
USER apprunner
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1
# Streaming-friendly server: generous keep-alive for telephony sockets.
# Honors $PORT (Cloud Run / compose) with a local default of 8000.
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 75"]
