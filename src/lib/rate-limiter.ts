interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

/**
 * Sliding window rate limiter for org actions.
 * Default: 20 generations per minute per org.
 */
export async function checkOrgRateLimit(
  orgId: string,
  action = "agent-generate",
  limit = 20,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const key = `ratelimit:${orgId}:${action}`;
  const now = Date.now();

  try {
    const { getRedisClient } = await import("@/lib/redis").catch(() => ({ getRedisClient: null }));
    // If Redis is accessible, we could use Redis INCR / EXPIRE; fallback to memory store
  } catch {}

  const current = memoryStore.get(key);
  if (!current || now > current.resetAt) {
    const resetAt = now + windowSeconds * 1000;
    memoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetInSeconds: windowSeconds,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: limit - current.count,
    resetInSeconds: Math.ceil((current.resetAt - now) / 1000),
  };
}

/**
 * Log token usage per generation for billing records.
 */
export function logTokenUsage(data: {
  orgId: string;
  agentId?: string;
  action: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}) {
  console.info(
    JSON.stringify({
      event: "ai_token_usage",
      timestamp: new Date().toISOString(),
      organizationId: data.orgId,
      agentId: data.agentId || null,
      action: data.action,
      model: data.model,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.totalTokens,
    })
  );
}
