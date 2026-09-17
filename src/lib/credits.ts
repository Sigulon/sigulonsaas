/**
 * Billing ledger — server-only credit operations (never import from client
 * components; the browser reads via `GET /api/billing/summary`).
 *
 * Money movement is atomic inside MongoDB transactions
 * via BillingRepository: reserve at ANSWERED, settle at
 * COMPLETED, release (settle with usage 0) on failed legs. Every op carries
 * an idempotency key (`reserve/settle/refund:{call_id}`), so webhook
 * redelivery replays to identical balances.
 *
 * Policy: postpaid grace — reserves succeed even when the balance doesn't
 * cover the estimate (flagged `insufficient`), so a live answered call is
 * never dropped over billing. The dashboard surfaces the hold.
 */

import { BillingRepository } from "@sigulon/database";

export function creditsPerMinute(): number {
  return Number(process.env.CREDITS_PER_MINUTE ?? 0.25) || 0.25;
}

export function creditsMinMinutes(): number {
  return Number(process.env.CREDITS_MIN_MINUTES ?? 1) || 1;
}

export function reserveMinutes(): number {
  return Number(process.env.CREDITS_RESERVE_MINUTES ?? 20) || 20;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Billable credits for a call: per-minute rate, minimum one minute. */
export function computeUsageCredits(durationSeconds: number): number {
  const minutes = Math.max(
    creditsMinMinutes(),
    Math.ceil(Math.max(0, durationSeconds || 0) / 60)
  );
  return round2(minutes * creditsPerMinute());
}

/** Hold placed at ANSWERED — covers a long call without re-reserving. */
export function reserveEstimateCredits(): number {
  return round2(reserveMinutes() * creditsPerMinute());
}

export const reserveKey = (callId: string) => `reserve:${callId}`;
export const settleKey = (callId: string) => `settle:${callId}`;
export const refundKey = (callId: string) => `refund:${callId}`;

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface RpcClient {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<RpcResult>;
}

function hasRpcClient(client: unknown): client is RpcClient {
  return (
    typeof client === "object" &&
    client !== null &&
    "rpc" in client &&
    typeof (client as { rpc?: unknown }).rpc === "function"
  );
}

async function rpcCall(
  client: RpcClient,
  fn: string,
  params: Record<string, unknown>
): Promise<RpcResult> {
  const res = await client.rpc(fn, params);
  return res;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface RpcStateRow {
  balance_credits: unknown;
  reserved_credits: unknown;
}

function toState(row: RpcStateRow) {
  const balance = num(row.balance_credits);
  const reserved = num(row.reserved_credits);
  // The MongoDB ledger stores `balance` after active holds are removed. Keep
  // this compatibility path aligned rather than subtracting a hold twice.
  return { balance, reserved, available: round2(balance) };
}

export type CreditState = ReturnType<typeof toState>;

/** Get-or-create the org's account row. */
export async function getCreditState(
  client: unknown,
  orgId: string
): Promise<CreditState> {
  if (hasRpcClient(client)) {
    const { data, error } = await rpcCall(client, "ensure_credit_account", {
      p_org_id: orgId,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow;
    return toState(row);
  }

  const state = await BillingRepository.getState(orgId);
  return {
    balance: state.balance,
    reserved: state.reserved,
    available: state.available,
  };
}

/** Hold the ANSWERED estimate. Idempotent per call. */
export async function reserveCallCredits(
  client: unknown,
  orgId: string,
  callId: string,
  estimate?: number
): Promise<
  CreditState & { did_reserve: boolean; insufficient: boolean }
> {
  if (hasRpcClient(client)) {
    const { data, error } = await rpcCall(client, "reserve_call_credits", {
      p_org_id: orgId,
      p_call_id: callId,
      p_estimate: estimate ?? reserveEstimateCredits(),
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow & {
      reserved: boolean;
      insufficient: boolean;
    };
    const state = toState(row);
    return {
      balance: state.balance,
      reserved: state.reserved,
      available: state.available,
      did_reserve: Boolean(row.reserved),
      insufficient: Boolean(row.insufficient),
    };
  }

  const res = await BillingRepository.reserveCallCredits({
    organizationId: orgId,
    callId,
    estimate: estimate ?? reserveEstimateCredits(),
  });

  return {
    balance: res.balance,
    reserved: res.reserved,
    available: res.available,
    did_reserve: res.didReserve,
    insufficient: res.insufficient,
  };
}

/**
 * Charge actual usage; with usage 0 this purely releases the hold
 * (busy/failed/no-answer legs). Idempotent per call.
 */
export async function settleCallCredits(
  client: unknown,
  orgId: string,
  callId: string,
  usageCredits: number
): Promise<
  CreditState & { settled: boolean; usage: number; refunded: number }
> {
  if (hasRpcClient(client)) {
    const { data, error } = await rpcCall(client, "settle_call_credits", {
      p_org_id: orgId,
      p_call_id: callId,
      p_usage: usageCredits,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow & {
      settled: boolean;
      usage_credits: unknown;
      refunded_credits: unknown;
    };
    return {
      ...toState(row),
      settled: Boolean(row.settled),
      usage: num(row.usage_credits),
      refunded: num(row.refunded_credits),
    };
  }

  const res = await BillingRepository.settleCallCredits({
    organizationId: orgId,
    callId,
    usageCredits,
  });

  return {
    balance: res.balance,
    reserved: res.reserved,
    available: res.available,
    settled: res.settled,
    usage: res.usage,
    refunded: res.refunded,
  };
}

// ---------------------------------------------------------------------------
// Ledger presentation (pure — shared by the summary API, tested directly)
// ---------------------------------------------------------------------------

export interface LedgerRow {
  id: string;
  created_at: string;
  event: string;
  amount_credits: number | string;
  call_id: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LedgerEntryView {
  id: string;
  created_at: string;
  event: string;
  label: string;
  amount: number;
  call_id: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  credit_purchase: "Credit purchase",
  credit_grant: "Credit grant",
  call_reservation: "Call hold",
  call_usage: "Call usage",
  call_refund: "Hold released",
  adjustment: "Adjustment",
};

/** Raw ledger rows → dashboard views (newest first, amounts signed). */
export function toLedgerView(rows: LedgerRow[]): LedgerEntryView[] {
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    event: r.event,
    label: EVENT_LABELS[r.event] ?? r.event,
    amount: num(r.amount_credits),
    call_id: r.call_id,
  }));
}

/** Total spend (absolute usage debits) across a set of ledger rows. */
export function sumUsage(rows: Pick<LedgerRow, "event" | "amount_credits">[]): number {
  return round2(
    rows
      .filter((r) => r.event === "call_usage")
      .reduce((acc, r) => acc + Math.abs(num(r.amount_credits)), 0)
  );
}
