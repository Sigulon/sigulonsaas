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

async function rpcCall(
  client: unknown,
  fn: string,
  params: Record<string, unknown>
): Promise<RpcResult> {
  const res = (await (
    client as {
      rpc: (f: string, p: Record<string, unknown>) => Promise<RpcResult>;
    }
  ).rpc(fn, params)) as RpcResult;
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
  return { balance, reserved, available: round2(balance - reserved) };
}

export type CreditState = ReturnType<typeof toState>;

export async function getCreditState(
  client: unknown,
  orgId: string
): Promise<CreditState> {
  const { data, error } = await rpcCall(client, "ensure_credit_account", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow;
  return toState(row);
}

export async function reserveCallCredits(
  client: unknown,
  orgId: string,
  callId: string
): Promise<{ state: CreditState; insufficient: boolean }> {
  const amount = reserveEstimateCredits();
  const { data, error } = await rpcCall(client, "reserve_call_credits", {
    p_org_id: orgId,
    p_call_id: callId,
    p_amount: amount,
    p_idempotency_key: reserveKey(callId),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow & {
    insufficient?: boolean;
  };
  return { state: toState(row), insufficient: Boolean(row?.insufficient) };
}

export async function settleCallCredits(
  client: unknown,
  orgId: string,
  callId: string,
  durationSeconds: number
): Promise<{ state: CreditState; charged: number }> {
  const charged = computeUsageCredits(durationSeconds);
  const { data, error } = await rpcCall(client, "settle_call_credits", {
    p_org_id: orgId,
    p_call_id: callId,
    p_actual_amount: charged,
    p_idempotency_key: settleKey(callId),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow;
  return { state: toState(row), charged };
}

export async function releaseCallCredits(
  client: unknown,
  orgId: string,
  callId: string
): Promise<CreditState> {
  const { data, error } = await rpcCall(client, "settle_call_credits", {
    p_org_id: orgId,
    p_call_id: callId,
    p_actual_amount: 0,
    p_idempotency_key: refundKey(callId),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RpcStateRow;
  return toState(row);
}
