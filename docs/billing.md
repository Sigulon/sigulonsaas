# Billing

Ledger-based voice credits. `credit_accounts(org_id, balance, reserved)`;
`credit_ledger` append-only audit (`call_reservation`, `call_usage`,
`call_refund`, `credit_grant/purchase`, `adjustment`), idempotent on
`(org_id, idempotency_key)`.

## Flow per call

1. **ANSWERED → reserve.** Outbound-answer webhook and (for inbound) the
   runtime's reserve ping hold `20 min × 0.25 cr/min = 5 cr`
   (`reserve:{call}`). Same key from both paths — first wins, second is a
   no-op.
2. **COMPLETED → settle.** Status webhook charges
   `ceil(duration/60) × rate`, minimum 1 minute (`settle:{call}`), refunds
   the unused hold (`refund:{call}`), stamps `calls.cost_credits`.
3. **Failed legs → release.** `busy/failed/no_answer/cancelled` settle
   with usage 0: the hold returns in full.
4. **Missing reservation → usage-only settle.** Direct-dial and legacy
   rows converge without a hold.

Money movement is atomic inside MongoDB transactions through
`BillingRepository`; the TypeScript layer (`src/lib/credits.ts`) provides
the pure pricing math and repository wrapper.

## Policy: postpaid grace

Reserves succeed even when the balance doesn't cover the estimate
(flagged `insufficient`, row marked `billing_hold`) — a live answered
call is never dropped over billing. The dashboard surfaces the hold;
collection is operator-side.

## Reading & topping up

- Dashboard: `GET /api/billing/summary` (balance/held/available, 7d
  spend, 20-entry history); billing page and dashboard spend read the
  ledger. The browser never writes credits.
- Top-ups are an operator action through `BillingRepository.grantCredits`
  until checkout automation lands; supply an idempotency key so retries are
  safe.

## Knobs (`.env`)

`CREDITS_PER_MINUTE=0.25`, `CREDITS_MIN_MINUTES=1`,
`CREDITS_RESERVE_MINUTES=20`.

## Scaling notes

One RPC per answer + one per terminal event — negligible next to call
traffic. Ledger tables are append-mostly: index `(org_id, created_at)`
carries the dashboard queries; archive or partition yearly past ~10M rows.
