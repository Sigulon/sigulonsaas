# Sigulon technical audit — 17 September 2026

## Scope and evidence

This is a source-level audit of the Next.js control plane, MongoDB data
layer, Redis coordination, Plivo webhooks, the Pipecat voice runtime, and the
campaign worker. No real phone call was placed during this audit. Docker
Desktop was unavailable, the local environment has no `REDIS_URL`, and the
previous tunnel log contains DNS/QUIC failures. Consequently, provider and
end-to-end latency values below are not presented as live measurements.

The verified provider contract is:

- LLM: OpenRouter `google/gemini-2.5-flash`
- STT: Cartesia `ink-whisper` for Telugu/Hindi/Tamil and `ink-2` for English
- TTS: Cartesia Sonic 3
- Telephony: Plivo bidirectional 8 kHz µ-law media stream

The Cartesia boundary maps `en-IN` → `en`, `hi-IN` → `hi`, `ta-IN` → `ta`,
and `te-IN` → `te`. These mappings are provider-specific and covered by the
voice-runtime tests.

## Actual architecture

```text
Browser
  -> Next.js route handlers / authenticated organization context
  -> MongoDB repositories (durable source of truth)
  -> Plivo REST / signed Plivo webhooks
  -> signed WSS media URL
  -> FastAPI voice runtime
  -> Pipecat: Plivo transport -> VAD -> Cartesia STT
             -> OpenRouter Gemini -> Cartesia TTS -> Plivo transport
  -> caller

Redis: call-config cache, live-session/heartbeat data, runtime concurrency,
       campaign queue/retry schedule/dispatch locks.

Campaign start route -> Redis queue -> Python campaign worker -> Plivo REST.
MongoDB remains the durable call, contact, campaign, event, transcript,
recording, and billing ledger store.
```

### Outbound call flow

1. `TestCallDialog` posts to `POST /api/calls` with an idempotency key.
2. The route authenticates the workspace, checks DNC/contact state, validates
   agent and caller-ID ownership, loads Plivo credentials, and verifies that
   `PUBLIC_WEB_URL` is a public HTTPS address before creating a call row.
3. A Mongo `calls` row and `call.created` event are written. Plivo receives
   answer, hangup, and recording callbacks containing the opaque call ID.
4. Plivo calls `POST /api/webhooks/plivo/outbound-answer?call_id=...`.
   The route loads the call only to select the organization's signing token,
   validates Plivo's V2/V3 signature, transitions the call to `ANSWERED`, and
   returns `<Stream>` XML.
5. The stream URL includes a short-lived HMAC token bound to that call ID.
   `voice-runtime/main.py` rejects missing, altered, expired, or cross-call
   tokens before accepting the WebSocket.
6. The runtime loads the cached canonical configuration or MongoDB config,
   obtains a Redis tenant concurrency slot, then creates one Pipecat pipeline.
   First greeting/audio is emitted by the pipeline, not by a Next.js request.
7. On close, Pipecat finalization persists transcript/summary/recording data
   best-effort and the signed Plivo status webhook settles billing exactly once.

### Inbound call flow

`POST /api/webhooks/plivo/inbound` normalizes the dialled E.164 number,
looks up its active Mongo phone-number assignment, validates the per-org
Plivo signature, creates the contact/call/event records, prewarms the config
cache, and returns the same signed Pipecat stream XML. It does not use the
outbound answer route or a separate speech engine.

### Campaign flow

`POST /api/campaigns/[id]/start` checks the campaign and agent, batches DNC
classification with `$in`, claims contacts in MongoDB, and enqueues bounded
jobs in Redis. The worker rechecks campaign/contact/DNC/agent/number data,
uses layered Redis dial governors, creates one call per campaign attempt, and
dials Plivo. The status webhook mirrors terminal outcomes to campaign
contacts. Redis retry and sweep paths repair lost queued/active work.

## Latency and real-time path

The previous runtime log contained a Redis config lookup failure taking about
1,464 ms. That was cache/config latency, not STT/LLM/TTS latency. The web
Redis cache connection is now bounded to 500 ms and cools down for 5 seconds
after a failure; the runtime fails closed for concurrency rather than silently
allowing unbounded calls.

The runtime logs these real-time stages as `[voice-latency]`: agent-config
lookup, session creation, credit reservation, pipeline start, STT final,
OpenRouter first token, Cartesia first audio, and serialized Plivo audio.
No post-change call exists yet from which to report measured STT latency, LLM
TTFT, TTS TTFB, or caller-heard first-audio latency.

`/api/webhooks/plivo/outbound-answer` no longer waits for the idempotent
credit hold or optional Redis config prewarm before returning XML. Those tasks
run with Next.js `after()`, while MongoDB remains the config fallback.

## Findings and disposition

### Closed critical/high findings

| Finding | Evidence/root cause | Resolution |
|---|---|---|
| Two voice stacks could serve calls | Missing runtime URL switched webhooks to Plivo `<GetInput>/<Speak>`, bypassing Cartesia/Pipecat. | Removed the legacy call path. Calls now reject cleanly unless `VOICE_RUNTIME_URL` is configured. The old endpoint returns 410 only. |
| Media WebSocket was guessable by call ID | A live call ID alone was enough to connect. | HMAC stream token with a 10-minute expiry and call binding; runtime verifies before accept. |
| Webhook signature gaps | Recording callback did not validate Plivo signatures; answer/status had development bypass behavior. | All Plivo callbacks validate V2/V3 signatures before writes and reject invalid requests. |
| Workspace context fallback | Missing session could resolve to the first organization. | Removed unauthenticated organization fallback. |
| Credit availability was double-subtracted | A reservation already deducted `balanceCredits`, then presentation deducted it again. | `available` now equals post-hold balance. A settlement ledger barrier prevents a late reserve after settlement. |
| Terminal callback race | Different terminal Plivo statuses could both run campaign/billing side effects. | A per-call `terminal:` idempotency event gates settlement and campaign completion. Call-state writes are now atomic conditional updates. |
| Duplicate click/retry could dial twice | No call-start idempotency key or unique database constraint. | `Idempotency-Key` is supported by `/api/calls`, indexed per organization, and sent by the test-call dialog. |
| Invalid tunnel left queued calls | The route created a call before checking that Plivo could reach a public HTTPS answer URL. | Public HTTPS validation now happens before contact/call creation. |
| Campaign start N+1 work | DNC checks and updates were performed per contact. | Replaced with a bounded `$in` lookup and grouped updates. |
| Redis cache outage added webhook latency | Cache connection retried on request paths. | Bounded connection timeout and cooldown; cache prewarm is non-critical. |

### Remaining high-priority operational work

1. Configure Redis for every runtime and control-plane deployment. The
   current local environment has no `REDIS_URL`; the runtime will correctly
   refuse call admission until it is set. This is intentional for concurrency
   and billing safety, not a provider defect.
2. Use a stable public HTTPS endpoint for both the web app and the runtime.
   Historical Cloudflare tunnel DNS/QUIC errors explain the earlier invalid
   `answer_url` and unreachable webhook behavior. Do not use localhost in
   `PUBLIC_WEB_URL` or `VOICE_RUNTIME_URL` for Plivo calls.
3. Run MongoDB as a replica set. Local Compose now initializes `rs0`; MongoDB
   transactions are required for the credit ledger. Production must use an
   Atlas replica set or an equivalent replica-set deployment.
4. Run a real provider test before claiming Telugu/Hindi/Tamil audio success.
   Unit tests verify mapping and pipeline construction, not a real Cartesia
   audio frame or a caller-heard response.

### Medium-priority work

- Pipecat emits a deprecation warning for `AudioContextTTSService`; schedule
  a compatibility upgrade before Pipecat 2.0.
- Recording has two sources: Pipecat creates a dual-track WAV and uploads it
  to GCS; Plivo also posts its provider recording URL. Both are recorded in
  MongoDB. Consolidate on one canonical playback source and serve private
  recordings through an authenticated signed/proxy URL. The generic storage
  helper cannot create a real GCS signature itself and Plivo URLs may require
  provider authentication.
- The campaign worker's `table()` code is an in-memory test adapter only;
  deployed clients use PyMongo. It contains no Supabase package, environment
  variable, or runtime fallback, but it should be renamed/replaced with a
  Mongo-shaped test double to make that boundary less confusing.
- Campaign dial governors are TTL-based admission counters. Runtime Redis
  slots enforce the hard per-organization active-call ceiling; if per-campaign
  active-call limits must be exact, persist/release a campaign slot on the
  signed terminal callback rather than relying on a short dial TTL.

## Database and tenant isolation

Mongo models cover organizations/members/sessions, agents/versions, phone
numbers, contacts/DNC, campaigns/campaign contacts, calls/events/outcomes,
transcripts/recordings, provider accounts, billing accounts/ledger/usage, and
supporting audit/invite/tool/appointment collections. The connection client is
shared and repositories call the common connector rather than creating a
per-request client.

Relevant indexes include organization + phone number, campaign + contact,
organization + call status + creation time, organization + campaign + creation
time, ledger/event idempotency keys, and the new organization + call-start
idempotency key. `npm run db:init` synchronizes declared indexes against the
target Mongo deployment.

Authorization is enforced at the route boundary with organization context and
organization-qualified repository queries. Webhooks choose an organization
only to obtain a signing token, then validate the provider signature before
changing state.

## Test status

| Check | Result |
|---|---|
| `npm run build` | PASS |
| `npm run test:unit` | PASS — 68 tests |
| `uv run --project voice-runtime --with pytest pytest voice-runtime/tests -q` | PASS — 65 tests; one Pipecat deprecation warning |
| `uv run --project services/campaign-worker --with pytest pytest services/campaign-worker/tests -q` | PASS — 27 tests |
| Docker Compose configuration parse | PASS; Docker daemon unavailable, so containers were not started |
| English/Telugu/Hindi/Tamil/inbound live calls | NOT RUN — requires Redis, public HTTPS tunnels, provider credentials, and a permitted test number |

## Required live acceptance test

After configuring Redis, Mongo replica set, public HTTPS web/runtime bases,
and provider credentials, test English, Telugu, Hindi, Tamil, inbound calling,
interruption, hangup, provider error, Redis outage, Mongo outage, insufficient
credits, two concurrent calls, a campaign batch, duplicate webhooks, recording,
and transcript persistence. Capture `[voice-latency]` logs for each language
before setting latency SLOs.
