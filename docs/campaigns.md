# Campaigns & outbound dialing

Outbound is fully async: the web plane validates, records, and enqueues;
`services/campaign-worker/` dials. No request path ever calls a provider
inline (the old sync Cartesia batch path was deleted in Phase 6).

## Lifecycle

`draft → running → completed` (campaigns); per contact
`pending → queued → dialing → ringing → answered → completed`, with
`failed / busy / no_answer / skipped / dnc` terminals. Terminals are
sticky everywhere (webhooks, worker, sweeps).

## Start (`POST /api/campaigns/[id]/start`)

Org-scoped; requires an active agent and an outbound-capable number.
A Redis dispatch lock serializes concurrent starts; a second start of a
running campaign returns a conflict rather than duplicating work.
The endpoint claims the first 500 `pending` rows: DNC rows
(flag or org entry, normalized) → `dnc`, unparseable → `skipped`, the
rest → `queued` + one job each on `sigulon:campaign:queue`. Returns
`{campaign_id, queued, dnc, skipped, status}`.

The worker refills campaigns larger than 500. After the current page has
reached terminal states (including its retries), a sweep takes the shared
per-campaign dispatch lock, atomically claims the next at-most-500 fresh
contacts, and appends their jobs as one Redis operation. If Redis rejects the
append, those claims return to `pending`; if the process crashes, the existing
stale-queued recovery sweep heals them. This keeps large campaigns progressing
without building an unbounded queue or dispatching a contact twice.

## Queue format

Job JSON: `{"campaign_id": str|null, "contact_id", "org_id", "attempt"}`
with optional single-call id, numbers, agent id, and max-attempts fields.
Retries live on the `sigulon:campaign:retries` ZSET (score = due unix-ms,
claimed via ZREM so N workers never double-process). Key layout is
mirrored in `src/lib/campaign-queue.ts` ↔ `queueing.py` — keep both in sync.

## Worker job flow

Pop → drop stale jobs (missing/foreign campaign/contact, paused campaign
parks to `pending`) → attempts/DNC checks → active agent + outbound
number → Lua-atomic layered governors (global/org/campaign/number, TTLs)
→ mint `calls(queued)` (campaigns) or reuse the web row (single dials) →
Plivo dial (`answer_url` bound to the call id). Accepted: row → `dialing`,
contact `dialing` + `attempt_count+1`. Refused slots: retry in 60s.
Dial errors: release slots, backoff `300s·2^failures`, terminalize when
attempts exhaust (the minted row fails too — never an orphan `queued`).

## Convergence (the guarantee)

- Status webhooks (`hangup_url`) mirror terminal states onto
  `campaign_contacts` and bump the campaign counter exactly once.
- The 120s sweep requeues stale `queued` (lost jobs/crashes), heals stale
  mid-call rows from their `calls` row (missed webhooks), refills the next
  500-contact page after the current one drains, fails dead dials, and marks
  drained campaigns `completed`.
- Single dials (`POST /api/calls`) ride the same queue with
  `campaign_id: null`.

## DNC

`contacts.do_not_call` plus org-scoped `dnc_entries` on normalized E.164
(`src/lib/dnc.ts`, tested A↛B). Checked at enqueue AND at dial.

## Scaling notes

Throughput ≈ `WORKER_NUMBER_MAX_CONCURRENT × numbers`, paced by the TTL
governors. Add worker replicas for volume; raise
`WORKER_CAMPAIGN_MAX_CONCURRENT` per campaign appetite; watch Plivo CPS
limits per number. Redis LIST/ZSET depth (`LLEN`, `ZCARD`) is the backlog
signal to alert on.
