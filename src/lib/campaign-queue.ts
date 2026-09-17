/**
 * Campaign dial queue — the web side of the outbound async pipeline.
 *
 * Key layout (mirrored by `services/campaign-worker/queueing.py` — keep both
 * in sync; the formats are plain JSON/strings so either language can read
 * what the other wrote):
 *
 *   sigulon:campaign:queue            LIST of job JSON {campaign_id, contact_id, org_id, attempt}
 *   sigulon:campaign:retries          ZSET member=job JSON score=unix-ms when due
 *   sigulon:campaign:{id}:dispatch_lock  STRING "1" with TTL (serializes /start)
 *   sigulon:conc:global               counters for layered dial governors
 *   sigulon:conc:org:{org} / campaign:{id} / number:{digits}
 *
 * Enqueue is fire-and-forget from the request path: jobs are cheap JSON and
 * the worker owns dialing, retries, and terminal states. If Redis is down,
 * enqueue throws — the caller turns that into a 503 (contacts stay pending,
 * nothing is half-dispatched).
 */

import { getRedisClient } from "./redis";

export const CAMPAIGN_QUEUE_KEY = "sigulon:campaign:queue";
export const CAMPAIGN_RETRY_ZSET = "sigulon:campaign:retries";

export function dispatchLockKey(campaignId: string): string {
  return `sigulon:campaign:${campaignId}:dispatch_lock`;
}

export interface DialJob {
  campaign_id: string | null;
  contact_id: string;
  org_id: string;
  attempt: number;
  agent_id?: string;
  single_call_id?: string;
  normalized_phone?: string;
  caller_number?: string;
  max_attempts?: number;
}

/** Push dial jobs onto the worker queue. Returns the count accepted. */
export async function enqueueDialJobs(jobs: DialJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const client = await getRedisClient();
  if (!client) throw new Error("Redis unavailable — cannot enqueue dial jobs");
  const payloads = jobs.map((j) => JSON.stringify(j));
  await client.rPush(CAMPAIGN_QUEUE_KEY, payloads);
  return jobs.length;
}

/**
 * Serialize concurrent `/start` calls for one campaign. Resolves true when
 * this caller holds the lock (and must release it), false when another
 * start is already dispatching (caller should report the idempotent state).
 */
export async function acquireDispatchLock(
  campaignId: string,
  ttlSecs = 120
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis unavailable — cannot start campaign");
  const res = await client.set(dispatchLockKey(campaignId), "1", {
    NX: true,
    EX: ttlSecs,
  });
  return res === "OK";
}

export async function releaseDispatchLock(campaignId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (client) await client.del(dispatchLockKey(campaignId));
  } catch (err) {
    console.warn("[queue] dispatch-lock release failed:", err);
  }
}
