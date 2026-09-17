# Load test plan (10 → 1000 concurrent calls)

No fabricated numbers below — run each tier, record, then raise. Abort a
tier when p99 answer latency, error rate, or cost/call breaches its budget.

## What "load" means per tier

| Tier | Concurrent | Purpose | Gate to next |
|---|---|---|---|
| T1 | 10 | Plumbing: webhooks, queue, dial, audio, settle | 0 errors, all contacts terminal |
| T2 | 50 | Governor behavior (org/campaign/number caps) | caps engage, no stuck rows |
| T3 | 200 | Runtime CPU/RAM per call, Redis hot keys | p99 first-audio < 3s |
| T4 | 1000 | Full press: replicas, Plivo CPS, MongoDB capacity | error rate < 0.5% |

## How to drive each tier

- **Outbound bulk (worker + runtime):** seed N contacts, start the
  campaign, watch `LLEN sigulon:campaign:queue`, worker processed logs,
  Plivo CPS dashboard, runtime `/metrics`, and MongoDB connection/operation metrics.
  Point Plivo numbers at a test answer flow first (no PSTN charges),
  then a real carrier prefix for T3+.
- **Inbound burst:** SIPp (or Plivo test harness) replaying inbound
  INVITEs at the Plivo number; assert answer-XML latency p99 < 500ms
  and pre-warm hit rate (runtime logs `cache hit`).
- **Webhook redelivery storm:** replay captured Plivo callbacks ×5;
  assert balances/contacts/counters unchanged (idempotency proof).

## Watch at every tier

- Runtime: CPU/call, `active_calls` gauge vs `max_concurrent_calls`
  rejections, Cartesia STT latency, and Cartesia TTS p99.
- Worker: queue depth over time (should drain linearly), sweep totals,
  stale heals (should be ~0 outside chaos tests).
- Data: MongoDB connection saturation, `credit_ledger` write latency,
  `call_events` dedupe conflicts (expected under replays).
- Cost: credits/call per tier (billing summary), Plivo per-minute.

## Known scaling levers (in priority order)

1. Runtime replicas (CPU-bound per pipeline) + session affinity.
2. Worker replicas + `WORKER_NUMBER_MAX_CONCURRENT` (Plivo CPS-bound).
3. Redis: single instance to thousands of calls; persistence on.
4. MongoDB: size the connection pool and indexes before T3; archive the
   ledger past ~10M rows.
