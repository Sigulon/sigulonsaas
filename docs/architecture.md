# Sigulon Architecture

Multi-tenant SaaS for real-time AI voice-calling agents targeting Indian SMBs.

```text
                         SIGULON
                            │
             ┌──────────────┴──────────────┐
             │                             │
        CONTROL PLANE                 VOICE PLANE
             │                             │
    Next.js (src/)         LiveKit Agents worker (voice-runtime/agent.py)
             │                             │
             ▼                             ▼
        MongoDB                       LiveKit Cloud (media)
             │                             │
             ▼                    ┌────────┼────────┐
           Redis                  ▼        ▼        ▼
             │                   STT       LLM       TTS
             ▼                Deepgram   Gemma 4   Cartesia
       Campaign Queue          nova-3   31B (Inf)  Sonic 3
             │
             ▼
     services/campaign-worker (LiveKit dispatch + SIP dial)
             │
             ▼
      Plivo SIP trunks ──► LiveKit Cloud SIP ──► Customer
```


## Physical Repository Layout

```text
sigulon/
├── src/                            # Next.js 16 Control Plane (App Router)
├── voice-runtime/                  # Python LiveKit Agents worker (agent.py)
├── services/
│   └── campaign-worker/            # Background Calling Worker (LiveKit dial)
├── packages/
│   ├── database/                     # Mongoose models and repositories
│   ├── agent-schema/                 # Canonical agent schema & validation
│   ├── shared-types/                 # Canonical call lifecycles, states, and types
│   └── billing/                      # Pricing math & ledger operations
├── deploy/                           # Web (Cloud Run) + workers (GKE/KEDA)
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
   - Customer calls the Plivo number.
   - Plivo inbound Zentrunk (SIP URI → `<project-sip-subdomain>.sip.livekit.cloud`)
     routes to the LiveKit Cloud inbound trunk (per number, metadata `{orgId, agentId}`).
   - LiveKit creates room `sigulon-call-{id}` + SIP participant; the dispatch
     rule fires the voice worker (`sigulon-voice-agent`, job metadata `{orgId, agentId}`).
   - Control plane `POST /api/webhooks/livekit` (`room_started`, verified with
     `WebhookReceiver` + `WebhookEvent` idempotency) creates the Call and
     reserves credits; the worker's `AgentSession` joins and greets.
   - Deepgram nova-3 STT → Gemma 4 31B LLM (+ tools) → Cartesia Sonic 3 TTS.

2. **Outbound Calls**:
   - Dashboard `POST /api/calls` (single) or campaign-worker (batch) dials via
     LiveKit API: create room + `CreateAgentDispatch` (metadata
     `{orgId, agentId, direction: outbound}`) + `CreateSIPParticipant`
     (org outbound trunk → Plivo termination → callee).
   - DNC + `CampaignContact.consent` + pacing + retries enforced before dial;
     caller ID is always an org-owned number.
   - Callee speaks FIRST; the agent responds (never greet-first on dial-out).
   - `room_finished` settles credits (actual duration, exactly-once
     `UsageRecord`), mirrors campaign outcomes, enqueues postcall.

3. **Lifecycle & Status Events**:
   - Canonical transitions: `CREATED -> QUEUED -> DIALING -> RINGING -> ANSWERED -> IN_PROGRESS -> COMPLETED`.
   - Failure branches: `FAILED`, `BUSY`, `NO_ANSWER`, `CANCELLED`.
   - Recorded persistently in `calls` and audited in `call_events` with unique deduplication IDs.
   - `dispatch_failed` marks the Call failed + refunds the reservation.
   - Recordings: LiveKit Egress → GCS (`sigulon-recordings-<env>`);
     `egress_ended` sets `Call.recording_url`.
   - Plivo `status` webhook stays ONLY for 2-week dual-run reconciliation
     (`PLIVO_DUAL_RUN` flag), then is deleted.
