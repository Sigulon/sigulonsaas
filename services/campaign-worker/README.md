# Sigulon Campaign Worker (outbound async dialing)

Pops dial jobs from Redis, dials via Plivo, and converges every contact to a
terminal state. The web service enqueues (`POST /api/campaigns/[id]/start`,
`POST /api/calls`); this worker owns everything after: layered dial
governors, DNC re-checks, retries with backoff, stale heals, and campaign
completion.

For an organization with active saved Plivo credentials, the worker decrypts
that organization’s AES-256-GCM credential pair using `ENCRYPTION_SECRET` and
uses it for its dial. Complete `PLIVO_AUTH_ID`/`PLIVO_AUTH_TOKEN` environment
credentials are only the platform fallback. The worker and web service must
receive the same `ENCRYPTION_SECRET`.

```
web /start ──claims first 500, marks queued──▶ sigulon:campaign:queue (LIST)
                                                    │ BRPOP
                                                    ▼
worker ──DNC?──slots?──calls row──Plivo dial──▶ callee answers
                                                    │ answer_url (web)
                                                    ▼
                                          wss://runtime/voice-runtime/{id}
hangup_url (web) ──calls + campaign_contacts terminal updates
sweep (120s) ──requeue lost jobs──heal missed webhooks──refill next 500──complete drained
```

## Layout

| Path | Purpose |
|---|---|
| `main.py` | Loop entrypoint (pop → process → retries → sweep → heartbeat) |
| `worker.py` | Job processing + sweeps (never raises out of `process_job`) |
| `queueing.py` | Keys (mirrored with `src/lib/campaign-queue.ts`), Lua governors, retry ZSET |
| `store.py` | MongoDB access (client injected — fakes in tests) |
| `dialer.py` | Plivo `Call/` dial with bounded retry |
| `phone.py` | E.164 mirror of `src/lib/phone.ts` |
| `config.py` | Env knobs with safe defaults |
| `tests/` | `python -m unittest discover -s tests` (fakes, no services needed) |

## Run locally

```bash
cd services/campaign-worker
cp .env.example .env   # fill credentials
uv sync
uv run python main.py  # or: python main.py (pip install -r requirements.txt)
```

Needs Redis (`docker run -d -p 6379:6379 redis:7`), Mongo access, Plivo
credentials, and a reachable `PUBLIC_WEB_URL` (Plivo must call back into
the web service's `/api/webhooks/plivo/outbound-answer` + `/plivo/status`).

Scale by running more replicas — the Lua governors, ZSET claims (ZREM
wins), sticky terminals, and idempotent webhooks keep N workers correct.

## Semantics worth knowing

* **Slots are dial governors with TTLs**, not hard in-call locks (the voice
  runtime owns the hard per-org gate). TTLs bound crash leaks by
  construction; failures release explicitly, successes ride the TTL.
* **Retries never flow through `/start`** — the start route claims the first
  page; the worker claims later zero-attempt pages only once the active page
  drains. Retries live on the ZSET with `next_attempt_at` mirrored for
  visibility, so they cannot be mistaken for new contacts.
* **Terminal guarantee**: status webhooks mirror onto `campaign_contacts`,
  and the sweep heals anything missed (lost jobs requeue, dead dials fail,
  drained campaigns complete).
* **Duplication note**: `dialer`/`phone`/retry intentionally mirror
  `voice-runtime/providers/*` + `src/lib/*` instead of importing them —
  each deployable stays self-contained (no cross-service build coupling).
