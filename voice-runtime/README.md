# Sigulon Voice Runtime (Pipecat)

Multi-tenant voice execution engine: **Pipecat** orchestration, **Cartesia**
STT, **Gemini 2.5 Flash
via OpenRouter** (`google/gemini-2.5-flash`) with function calling,
**Cartesia Sonic** TTS, and
**Plivo** Audio Streaming telephony. One deployment serves all tenants — no
per-org processes, no tenant-specific code. Replaces the previous
Cartesia-Line runtime (see git history) so STT/TTS vendors can be swapped
without rearchitecting.

```
Plivo call (answered)
  │  WebSocket: /voice-runtime/{call_id}  (mulaw/8kHz JSON audio stream)
  ▼
FastAPI (main.py)
  ├─ load_agent_config(call_id): Redis → MongoDB source      (config.py)
  ├─ acquire_concurrency_slot(tenant) — plan-limit gate      (config.py)
  ├─ VoiceSession create/heartbeat (Redis)                   (session.py)
  ▼
Pipecat pipeline, one per call                              (pipeline.py)
  transport.input() → Silero VAD → STT → user aggregator →
  OpenRouter Gemini 2.5 Flash LLM (+ tools) → Cartesia TTS → transport.output() →
  assistant aggregator            (barge-in via clearAudio)
  ▲ custom Plivo FrameSerializer                             (serializers/plivo.py)
  ▼ idempotent cleanup on EVERY exit path: finalize_call()   (session.py)
Providers live in providers/ (one factory branch per vendor — adding a
vendor never rewrites the pipeline):
  stt.py (Cartesia) · llm.py (OpenRouter Gemini) ·
  tts.py (Cartesia) · telephony.py (Plivo answer XML + REST hangup/dial) ·
  errors.py (transient/permanent classification + bounded retry)
```

## Layout

| Path | Purpose |
|---|---|
| `main.py` | FastAPI app, WS handler, session tracking, /readyz /metrics /internal |
| `config.py` | `AgentConfig` model, `load_agent_config()`, Redis slot helpers |
| `session.py` | `VoiceSession` Redis model + idempotent `finalize_call()` (calls + call_events) |
| `observability.py` | Call-context JSON logging, in-memory metrics, readiness checks |
| `auth.py` | Bearer-secret gate for `/internal/*` (fail-closed) |
| `providers/` | Swappable vendor factories: `stt`, `llm`, `tts`, `telephony`, `errors` |
| `serializers/plivo.py` | Custom Pipecat `FrameSerializer` for Plivo Audio Streaming |
| `pipeline.py` | Pipeline builder (thin wrappers over `providers/`) |
| `tools/` | Function-calling tools (`book_appointment` example) |
| `tests/` | Phase 4 regression tests (`uv run python -m unittest discover -s tests`) |
| `requirements.txt` / `pyproject.toml` | Pinned deps (`pipecat-ai==1.8.1`, verified) |

## Run locally

```bash
cd voice-runtime

# With uv (recommended):
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000

# With pip:
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Copy `.env.example` to `.env` and set at minimum
`MONGODB_URI`, `CARTESIA_API_KEY`, `OPENROUTER_API_KEY`, `REDIS_URL`
(`docker run -d -p 6379:6379 redis:7` for a local Redis).
`GET /healthz` should return `{"status":"ok"}`.

To exercise a call without Plivo, pre-warm Redis with a config and open a
WebSocket client to `ws://localhost:8000/voice-runtime/<call_id>`:

```bash
redis-cli SET 'sigulon:call:test-call-1:config' \
  '{"call_id":"test-call-1","agent_id":"<voice_agents.id>","tenant_id":"<org.id>",
     "direction":"inbound","language":"en","stt_provider":"cartesia",
     "voice_id":"<cartesia-voice-uuid>","llm_provider":"openrouter","llm_model":"google/gemini-2.5-flash",
     "enabled_tools":["book_appointment"],"max_concurrent_calls":5}'
```

> The Silero VAD model ships inside the `pipecat-ai` package and loads
> locally (~0.3s) — no model download on cold start.

## Plivo wiring (control plane)

The Next.js control plane answers the call with XML pointing at this
service. Expected WebSocket URL format:

```
wss://<voice-runtime-host>/voice-runtime/{call_id}
```

Answer-XML template (`answer_url` response):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true" keepCallAlive="true"
          contentType="audio/x-mulaw;rate=8000"
          statusCallbackUrl="https://<voice-runtime-host>/plivo/status-callback">
    wss://<voice-runtime-host>/voice-runtime/{call_id}
  </Stream>
</Response>
```

Notes:

* The service learns Plivo's `streamId`/`callId` from the live `start`
  event — nothing needs to be passed in the URL besides `call_id`.
* There is **no** `stop` event on the stream socket: call end = WebSocket
  close (cleanup runs in the endpoint's `finally`). `stopped`/`failed`
  arrive at `/plivo/status-callback` over HTTP for audit.
* Barge-in works out of the box: user speech mid-reply triggers Plivo
  `clearAudio` via the serializer.
* No US-only assumptions anywhere: phone numbers are opaque strings, and
  Plivo India numbers need KYC on the Plivo side (see Plivo's
  “Rent India Numbers” docs) — nothing to change here.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `CARTESIA_API_KEY` | yes | Cartesia STT + TTS |
| `OPENROUTER_API_KEY` | yes | Gemini 2.5 Flash via OpenRouter |
| `REDIS_URL` | yes | Config cache + concurrency counters |
| `MONGODB_URI` | yes | Source-of-truth agent/call configuration and durable call records |
| `INTERNAL_API_SECRET` | yes | Bearer secret for `/internal/*` (fail-closed when unset) |
| `PLIVO_AUTH_ID` / `PLIVO_AUTH_TOKEN` | only for REST hangup | Only if serializer `auto_hang_up` is enabled |
| `CARTESIA_TTS_MODEL` | no | Reserved for a service-wide TTS default |
| `CALL_CONFIG_TTL_SECS` / `ACTIVE_CALLS_KEY_TTL_SECS` | no | Redis TTL tuning (defaults 3600/7200) |
| `PORT` | no | Default `8000` |

## Cartesia STT notes

* Runtime bundle codes map at the Cartesia boundary: `en-IN → en`,
  `hi-IN → hi`, `ta-IN → ta`, and `te-IN → te`.
* Cartesia Sonic 3 is required for the Sigulon languages; Sonic 2 does not
  support Telugu or Tamil and is rejected during startup validation.
* Cartesia STT uses `ink-2` for English and `ink-whisper` for every other
  supported language; Pipecat's local Silero VAD handles turn-taking.
* Error recovery: Cartesia reconnects are owned by its Pipecat services;
  OpenRouter transient 5xx/timeouts retry ×3;
  Cartesia TTS retries once then ends the call loudly (never substitutes a
  voice); Plivo REST + MongoDB finalize writes retry ×3 behind the
  idempotent finalized-marker. See `providers/errors.py`.

## Ops endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness (`{"status":"ok"}`) |
| `GET /readyz` | none | Redis / MongoDB / Cartesia / OpenRouter / Plivo checks (200 ok, 503 degraded) + metric snapshot |
| `GET /metrics` | none | Prometheus exposition (per-pod counters) |
| `POST /internal/finalize-call` | Bearer `INTERNAL_API_SECRET` | Idempotent finalize (control plane / worker) |
| `GET /internal/session/{call_id}` | Bearer `INTERNAL_API_SECRET` | Live session inspection |

## Deploy (Fly.io / Cloud Run)

This service holds long-lived WebSockets — do **not** put it on
scale-to-zero serverless.

* Fly.io: `fly launch` with `[[services]] internal_port = 8000`,
  `protocol = "tcp"`, generous `timeout` / `concurrency` for WS.
* Cloud Run: deploy with `--min-instances 1 --timeout 3600 --no-cpu-throttling`
  and session affinity if scaled past one instance.

Either way: public `wss://` URL, Redis reachable (Upstash/Memorystore),
env from secrets, and `GET /readyz` as the health check (`/healthz` stays
the lightweight liveness probe).
