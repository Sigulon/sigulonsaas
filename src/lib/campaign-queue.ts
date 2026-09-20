/**
 * Campaign dial queue — the web side of the outbound async pipeline.
 *
 * Key layout (mirrored by `services/campaign-worker/queueing.py` — keep both
 * in sync; the formats are plain JSON/strings so either language can read
 * what the other wrote):
 *
 *   sigulon:campaign:queue            LIST of job JSON {campaign_id, contact_id, org_id, attempt}
 *   sigulon:campaign:retries          ZSET member=job JSON score=unix-ms when due
 *   sigulon:campaign:{id}:dispatch_lock  STRING token value with TTL
 *     (serializes /start; token ownership enforced on release so a stale
 *     holder can never delete a fresh holder's lock)
 *   sigulon:conc:global               counters for layered dial governors
 *   sigulon:conc:org:{org} / campaign:{id} / number:{digits}
 *
 * Enqueue is fire-and-forget from the request path: jobs are cheap JSON and
 * the worker owns dialing, retries, and terminal states. If Redis is down,
 * enqueue throws — the caller turns that into a 503 (contacts stay pending,
 * nothing is half-dispatched).
 */

import { randomUUID } from "crypto";
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
 *
 * Token ownership: acquire stores a per-call random token (in Redis as the
 * lock value and in a module-level Map keyed by campaignId); release deletes
 * the key only when the stored value still equals our token (Lua
 * compare-and-del), so a stale holder whose TTL expired can never delete a
 * fresh holder's lock.
 */
const dispatchLockTokens = new Map<string, string>();

const DISPATCH_LOCK_RELEASE_LUA =
  'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end';

export async function acquireDispatchLock(
  campaignId: string,
  ttlSecs = 120
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis unavailable — cannot start campaign");
  const token = randomUUID();
  const res = await client.set(dispatchLockKey(campaignId), token, {
    NX: true,
    EX: ttlSecs,
  });
  if (res === "OK") {
    dispatchLockTokens.set(campaignId, token);
    return true;
  }
  return false;
}

export async function releaseDispatchLock(campaignId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const key = dispatchLockKey(campaignId);
    const token = dispatchLockTokens.get(campaignId);
    dispatchLockTokens.delete(campaignId);
    if (!token) return;
    try {
      const c = client as unknown as {
        eval: (script: string, opts: { keys: string[]; arguments: string[] }) => Promise<unknown>;
      };
      if (typeof c.eval === "function") {
        await c.eval(DISPATCH_LOCK_RELEASE_LUA, {
          keys: [key],
          arguments: [token],
        });
        return;
      }
    } catch {
      // fall through to get+del compare
    }
    // Fallback when EVAL is unavailable: only delete on value match.
    const current = await client.get(key);
    if (current === token) await client.del(key);
  } catch (err) {
    console.warn("[queue] dispatch-lock release failed:", err);
  }
}
