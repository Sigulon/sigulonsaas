# Voice runtime

`voice-runtime/` — FastAPI + Pipecat. One deployment serves all tenants;
every call gets a dedicated pipeline built from its `AgentConfig`.

## Endpoints

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness |
| `GET /readyz` | none | Redis / MongoDB / provider-key checks (200 ok, 503 degraded) + metrics |
| `GET /metrics` | none | Prometheus counters (per-pod) |
| `WS /voice-runtime/{call_id}[?to_number=&from_number=]` | config-gated | Plivo audio stream (mulaw/8kHz JSON) |
| `POST /plivo/status-callback` | none | Stream audit complement (WS close is authoritative) |
| `POST /internal/finalize-call` | bearer | Idempotent finalize (control plane / worker) |
| `GET /internal/session/{call_id}` | bearer | Live session inspection |

## Per-call flow

1. Accept WS → `load_agent_config` (Redis `sigulon:call:{id}:config`,
   else MongoDB `calls → agents → organizations`, re-cached; else
   `phone_numbers` fallback when `?to_number=` is present).
2. Concurrency gate (`acquire_concurrency_slot`, plan limit).
3. `VoiceSession` create + 30s heartbeats; billing reserve ping (best-effort).
4. `build_call_pipeline` (allow-listed providers only — anything else fails
   fast, never substitutes): Silero VAD → STT → OpenRouter Gemini 2.5 Flash (+ tools) →
   Cartesia TTS → Plivo serializer (barge-in via `clearAudio`).
5. Greet (inbound, or outbound with an introduction) and run to hangup,
   error, or `max_call_seconds`.
6. `finally`: snapshot transcript → OpenRouter Gemini 2.5 Flash summary/disposition (best-effort)
   → idempotent `finalize_call` (slot release + `calls` update + `call_events`
   audit + session delete).

## Providers (`providers/`)

The pipeline imports factories, never vendor SDKs — a new vendor is one
factory branch. STT: Cartesia (`ink-2` for English / `ink-whisper` for other
languages). LLM: Gemini 2.5 Flash via OpenRouter. TTS: Cartesia Sonic (speed clamped
0.6–1.5). Telephony: answer-XML builder + REST hangup/dial/transfer with
bounded retry (`providers/errors.py`: transient/permanent + backoff).

## Tools (`tools/`)

`check_availability`, `book_appointment` (real `appointments` rows),
`pricing_lookup` (agent `settings.pricing`), `create_lead` (contacts
upsert), `transfer_call` (Plivo Transfer to `settings.transfer_number`).
Only names in the agent's `enabled_tools` are advertised. All queries are
tenant-scoped via `CallResources`.

## Contract with the web plane

- Redis key `sigulon:call:{id}:config` holds the canonical agent config
  (`src/lib/agent-config.ts` ↔ `AgentConfig.to_canonical/from_canonical`,
  no secrets).
- Stream URL `wss://<host>/voice-runtime/{calls.id}`; Plivo `streamId` /
  `callId` are learned from the `start` event.
- Env: see `voice-runtime/.env.example` (all vars documented there).

## Scaling

Long-lived sockets: Cloud Run with min-instances ≥ 1, no CPU throttling,
timeout 3600s (`deploy/gcp/cloudrun-runtime.yaml`). Replicas are stateless
(Redis holds sessions); overshoot past one replica wants session
affinity. Measure per-call CPU before sizing — see `docs/load-test-plan.md`.
