# Voice runtime (LiveKit Agents worker)

`voice-runtime/` — LiveKit Agents 1.x worker (`agent.py`, `python agent.py start`).
One deployment serves all tenants; every LiveKit room gets a dedicated
`AgentSession` built from its `AgentConfig`. Media NEVER touches our servers —
LiveKit Cloud carries it; the worker only sees frames via the Agents SDK.

```
INBOUND:
  Caller → Plivo number → Plivo inbound Zentrunk (SIP)
    → <project-sip-subdomain>.sip.livekit.cloud
    → LiveKit Cloud inbound trunk (metadata {orgId, agentId})
    → room (sigulon-call-{id}) + SIP participant
    → dispatch rule → worker (job metadata {orgId, agentId})
    → AgentSession (STT→LLM→TTS) joins room → greets (config greeting)

OUTBOUND (campaign / single-dial):
  campaign-worker → LiveKit API: create room
    + CreateAgentDispatch(agent sigulon-voice-agent, metadata {orgId, agentId, direction: outbound})
    + CreateSIPParticipant(outbound trunk → Plivo termination → callee)
    → callee speaks FIRST → agent responds (never greet-first on dial-out)
```

## Session build (`agent.py`)

1. Parse `ctx.job.metadata` JSON `{orgId, agentId}` (+ room metadata fallback);
   `load_agent_config_for_job` (Redis 60s → MongoDB source of truth).
   Room name maps 1:1 to the session key (`sigulon:call:{room}:config`).
2. Concurrency gate (`acquire_concurrency_slot`, plan limit, fail-closed).
3. Billing reserve ping (best-effort; zero-balance per `on_no_balance`).
4. `AgentSession` (target voice stack):
   - STT: `inference.STT("deepgram/nova-3", language)` via LiveKit Inference
   - LLM: `inference.LLM("google/gemini-2.5-flash")` via LiveKit Inference
   - TTS: `cartesia.TTS(model="sonic-3.6", voice=config.voice_id)` via direct Cartesia plugin —
     voice UUID ALWAYS explicit from config (never default)
   - VAD: `silero.VAD.load()`; turn detection: `MultilingualModel`
   - `allow_interruptions=True`; latency/observability hooks attached
5. Tools from `enabled_tools` (`tools/`, `@function_tool`, org-scoped).
6. INBOUND: `generate_reply(greeting)` on participant join.
   OUTBOUND: wait for callee speech — never greet first.
7. On end: transcript event snapshot → LLM summary/outcome →
   POST control API (`/api/internal/calls/postcall`, owner WhatsApp/email
   fan-out) → settle credits (actual duration) → release slot.

## Providers (`providers/`)

Descriptors, never vendor SDKs in `agent.py`.
- STT: Deepgram `nova-3` via LiveKit Inference gateway (`language.py` maps en/hi/hinglish/ta/te/…).
- LLM: Google Gemini 2.5 Flash (`google/gemini-2.5-flash`) via LiveKit Inference gateway.
- TTS: Cartesia Sonic 3.6 (`sonic-3.6`) via direct Cartesia plugin (speed clamped 0.6–1.5).
- Retries: `providers/errors.py` (transient/permanent + backoff; Cancelled never masked).

## Recordings

Runtime never touches recording files. LiveKit Egress records the audio
track → GCS (`sigulon-recordings-<env>`); the control plane marks the Call
from the `egress_ended` webhook (`Call.recording_url`).

## Env

See `voice-runtime/.env.example`: `LIVEKIT_URL/API_KEY/API_SECRET/`
`WEBHOOK_SECRET/AGENT_NAME`, `CARTESIA_API_KEY`, `GCS_RECORDINGS_BUCKET`, Mongo/Redis,
`INTERNAL_API_*`. Validate with `require_livekit_env()`.

## Tests

`py -m unittest discover -s tests` (from `voice-runtime/`):
agent (metadata/tools/language/greeting/caps), tools (ported assertions),
billing (reserve/settle/zero-balance), language stack, postcall.
