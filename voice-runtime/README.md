# Sigulon Voice Worker (LiveKit Agents 1.x)

Multi-tenant voice execution engine: **LiveKit Agents 1.x** session
orchestration, **Deepgram nova-3** STT via Inference gateway, **Gemma 4 31B**
LLM with OpenRouter fallback, **Cartesia Sonic 3** TTS, and **LiveKit SIP**
telephony. One deployment serves all tenants — no per-org processes, no
tenant-specific code. Media never touches our servers.

```
INBOUND:  Caller → Plivo number → Plivo Zentrunk (SIP)
            → LiveKit inbound trunk → room + SIP participant
            → dispatch → worker (agent.py, sigulon-voice-agent)
            → AgentSession joins, greets
OUTBOUND: campaign-worker → LiveKit API (room + AgentDispatch + SIP
            participant) → callee speaks first → agent responds
```

## Layout

| Path | Purpose |
|---|---|
| `agent.py` | Worker entrypoint (`python agent.py start`), dispatch → AgentSession |
| `config.py` | `AgentConfig` model, job/metadata loaders, Redis slot helpers, LiveKit env validation |
| `language.py` | Deepgram STT tags + Cartesia TTS boundary + prompt hints (Hinglish → `multi`) |
| `observability.py` | Call-context JSON logging, in-memory metrics, readiness checks |
| `auth.py` | Control-API auth helpers (bearer secret, HMAC stream tokens) |
| `providers/` | Model descriptors: `stt` (deepgram/assemblyai-fallback), `llm` (inference/openrouter-fallback), `tts` (cartesia), `errors` |
| `tools/` | Function-calling tools as LiveKit `@function_tool` (`book_appointment`, …) |
| `postcall.py` | Transcript → summary/outcome → POST control API |
| `billing.py` | Reserve on start / settle on end / zero-balance branch |
| `latency.py` | Per-turn latency tracker on session events (dashboard-compatible format) |
| `tests/` | Regression tests (`py -m unittest discover -s tests`) |
| `requirements.txt` / `pyproject.toml` | Pinned deps (`livekit-agents 1.x`, verified) |

## Run locally

```bash
cd voice-runtime

# With uv (recommended):
uv sync
python agent.py start

# With pip:
pip install -r requirements.txt
python agent.py start
```

Copy `.env.example` to `.env` and set at minimum `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `CARTESIA_API_KEY`, `MONGODB_URI`,
`REDIS_URL` (`docker run -d -p 6379:6379 redis:7` for a local Redis).
Worker logs `registered agent sigulon-voice-agent` when LiveKit accepts it.

To exercise a call without SIP, pre-warm Redis with a config and dispatch a
test room from the LiveKit dashboard with metadata
`{"orgId":"<org>","agentId":"<agent>","direction":"inbound"}`:

```bash
redis-cli SET 'sigulon:call:test-call-1:config' \
  '{"call_id":"test-call-1","organization_id":"<org>","id":"<agent>",
     "direction":"inbound","voice":{"voice_id":"<cartesia-voice-uuid>","language":"en"},
     "instructions":{"system_prompt":"You are helpful.","introduction":"Hello!"},
     "tools":["book_appointment"]}'
```

> Silero VAD loads via `livekit-plugins-silero` (~0.3s) — no model download
> on cold start beyond the plugin wheel.

## LiveKit wiring (control plane)

Numbers map to LiveKit inbound trunks (per number, metadata `{orgId, agentId}`);
the Plivo Zentrunk SIP URI for each number points at
`<project-sip-subdomain>.sip.livekit.cloud;transport=tcp` (see
`src/lib/livekit.ts`). Dispatch rules fire `sigulon-voice-agent` per room;
room names are `sigulon-call-{callId}` (1:1 session key).

Notes:

* Inbound greets from config; outbound dial-out NEVER greets first.
* Barge-in via `allow_interruptions=True`; turn detection `MultilingualModel`.
* No US-only assumptions: phone numbers are opaque strings; region pins per
  number (`us-east` default, Indian numbers `in-mumbai`).
* Recordings via LiveKit Egress → GCS; the worker never touches files.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | yes | Cloud + Inference gateway + dispatch |
| `CARTESIA_API_KEY` | yes | Sonic 3 TTS (voice UUID always explicit) |
| `DEEPGRAM_API_KEY` | via gateway | nova-3 STT (or LiveKit-provided) |
| `OPENROUTER_API_KEY` | fallback LLM | Gemini 2.5 Flash fallback on primary error |
| `GCS_RECORDINGS_BUCKET` | yes | Egress destination (`sigulon-recordings-<env>`) |
| `REDIS_URL` | yes | Config cache + concurrency counters |
| `MONGODB_URI` | yes | Source-of-truth agent/call configuration |
| `INTERNAL_API_SECRET` / `INTERNAL_API_BASE_URL` | yes | Reserve/settle/postcall callbacks |
| `CALL_CONFIG_TTL_SECS` / `ACTIVE_CALLS_KEY_TTL_SECS` | no | Redis TTL tuning (defaults 3600/7200) |

## Speech notes

* Bundle codes map at the provider boundary: `en-IN → en`, `hi-IN → hi`,
  `hinglish → multi` (code-mix auto-detect) + prompt note, `ta/te → ta/te`.
* Cartesia Sonic 3 is required; voice UUID always explicit (never default).
* Error recovery: Inference reconnects owned by the gateway; AssemblyAI STT
  / OpenRouter LLM fallbacks engage ONLY on primary error (never dual-run);
  Cartesia TTS retries once then ends loudly (never substitutes a voice).
  See `providers/errors.py`.

## Ops

Outbound-only worker: no HTTP ingress, no `/healthz`. Liveness = Agents SDK
registration (`registered agent sigulon-voice-agent`). Metrics via session
`metrics_collected` → `observability.log_metrics` (same `sigulon_runtime_*`
+ `[voice-latency]` formats). Deploy: `CMD ["python","agent.py","start"]`,
single always-on process, KEDA on CPU/concurrent dispatch (see
`deploy/gcp/voice-worker/`).
