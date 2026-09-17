# Sigulon Architecture

Multi-tenant SaaS for real-time AI voice-calling agents targeting Indian SMBs.

```text
                         SIGULON
                            │
             ┌──────────────┴──────────────┐
             │                             │
        CONTROL PLANE                 VOICE PLANE
             │                             │
    Next.js (src/)      Pipecat (voice-runtime)
             │                             │
             ▼                             ▼
        MongoDB                       Real-time calls
             │                             │
             ▼                    ┌────────┼────────┐
           Redis                  ▼        ▼        ▼
             │                   STT        LLM                TTS
             ▼                Cartesia   OpenRouter Gemini   Cartesia
       Campaign Queue
             │
             ▼
     services/campaign-worker
             │
             ▼
      Telephony (Plivo)
             │
             ▼
          Customer
```

## Physical Repository Layout

```text
sigulon/
├── src/                            # Next.js 16 Control Plane (App Router)
├── voice-runtime/                  # Python + Pipecat Voice Plane
├── services/
│   └── campaign-worker/            # Background Calling Worker
├── packages/
│   ├── database/                     # Mongoose models and repositories
│   ├── agent-schema/                 # Canonical agent schema & validation
│   ├── shared-types/                 # Canonical call lifecycles, states, and types
│   └── billing/                      # Pricing math & ledger operations
├── deploy/                           # Canonical Cloud Run service definitions
├── docs/
├── .github/
│   └── workflows/                    # GitHub Actions CI/CD workflows
├── docker-compose.yml
├── .env.example
├── package.json                      # npm workspaces root
└── README.md
```

## Call Execution Flow

1. **Inbound Calls**:
   - Customer calls carrier number.
   - Telephony calls `POST /api/webhooks/plivo/inbound`.
   - Control plane resolves `To` number to organization & active agent.
   - Control plane inserts call record (`status: created`, `direction: inbound`), initializes `VoiceSession`, pre-warms canonical config in Redis.
   - Returns answer XML with bidirectional `<Stream>` pointing to `wss://{VOICE_RUNTIME_URL}/voice-runtime/{call_id}`.
   - Voice Runtime accepts WebSocket, dynamically constructs the pipeline (Cartesia STT, OpenRouter Gemini 2.5 Flash LLM, Cartesia TTS), and executes the call.

2. **Outbound Calls**:
   - Dashboard API `POST /api/calls` creates a call record and enqueues a job into Redis `sigulon:campaign:queue`.
   - Campaign Worker consumes job from queue, applies layered concurrency limits, re-verifies DNC, dials telephony (Plivo).
   - Telephony rings customer; on answer, Plivo calls `POST /api/webhooks/plivo/outbound-answer`.
   - Webhook bridges to Pipecat WebSocket `wss://{VOICE_RUNTIME_URL}/voice-runtime/{call_id}`.

3. **Lifecycle & Status Events**:
   - Canonical transitions: `CREATED -> QUEUED -> DIALING -> RINGING -> ANSWERED -> IN_PROGRESS -> COMPLETED`.
   - Failure branches: `FAILED`, `BUSY`, `NO_ANSWER`, `CANCELLED`.
   - Recorded persistently in `calls` and audited in `call_events` with unique deduplication IDs.
