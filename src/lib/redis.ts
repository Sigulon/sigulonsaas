/**
 * Redis client + call-config pre-warm for the voice runtime contract.
 *
 * The runtime reads `sigulon:call:{call_id}:config` (see
 * `callConfigCacheKey()` in `lib/agent-config.ts` and `CALL_CONFIG_KEY` in
 * `voice-runtime/config.py`). The inbound webhook (and, in Phase 6, the
 * campaign worker) writes the canonical agent config there with a short TTL
 * so the runtime rarely pays the MongoDB fallback.
 *
 * Pre-warm is strictly best-effort: on a cache miss the runtime loads the
 * same config from MongoDB, so a down/unconfigured Redis must never fail
 * a webhook. Every failure path logs and resolves — never rejects.
 */

import { createClient, type RedisClientType } from "redis";
import type { CanonicalAgentConfig } from "./agent-config";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;
let nextConnectionAttemptAt = 0;

const REDIS_CONNECT_TIMEOUT_MS = 500;
const REDIS_RETRY_COOLDOWN_MS = 5_000;

function redisUrl(): string | null {
  return process.env.REDIS_URL || null;
}

async function getClient(): Promise<RedisClientType | null> {
  const url = redisUrl();
  if (!url) return null;
  if (client?.isOpen) return client;
  if (Date.now() < nextConnectionAttemptAt) return null;
  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const c = createClient({
          url,
          socket: {
            // Redis cache work must never consume the Plivo answer budget.
            connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
            reconnectStrategy: false,
          },
        }) as RedisClientType;
        c.on("error", (err) => {
          console.warn("[redis] client error:", (err as Error)?.message ?? err);
        });
        await c.connect();
        client = c;
        nextConnectionAttemptAt = 0;
        return c;
      } catch (err) {
        nextConnectionAttemptAt = Date.now() + REDIS_RETRY_COOLDOWN_MS;
        console.warn(
          "[redis] connect failed; cache operations will skip briefly:",
          (err as Error)?.message ?? err
        );
        return null;
      } finally {
        connectPromise = null;
      }
    })();
  }
  return connectPromise;
}

/**
 * Shared client accessor for other queue modules (campaign jobs, locks).
 * Null when Redis is unconfigured/unreachable — callers must degrade.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  return getClient();
}

/**
 * Cache one call's canonical config for the runtime. Resolves true when the
 * write landed, false when Redis is unconfigured/unreachable (the runtime's
 * MongoDB fallback covers that case).
 */
export async function prewarmCallConfig(
  callId: string,
  config: CanonicalAgentConfig,
  ttlSecs?: number
): Promise<boolean> {
  const ttl = ttlSecs ?? Number(process.env.CALL_CONFIG_TTL_SECS ?? 3600);
  try {
    const c = await getClient();
    if (!c) return false;
    await c.set(`sigulon:call:${callId}:config`, JSON.stringify(config), {
      EX: ttl,
    });
    return true;
  } catch (err) {
    console.warn(
      `[redis] pre-warm failed for call ${callId}:`,
      (err as Error)?.message ?? err
    );
    return false;
  }
}
