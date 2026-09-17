import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@sigulon/database";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; message?: string }> = {
    mongodb: { ok: false },
    redis: { ok: false },
  };

  // 1. Check MongoDB
  try {
    const dbHealthy = await checkDatabaseHealth();
    checks.mongodb = { ok: dbHealthy.ok, message: dbHealthy.error };
  } catch (err: unknown) {
    checks.mongodb = {
      ok: false,
      message: err instanceof Error ? err.message : "MongoDB check failed",
    };
  }

  // 2. Check Redis (optional/degraded mode if unavailable)
  try {
    const redis = await getRedisClient();
    if (redis) {
      const pong = await redis.ping();
      checks.redis = { ok: pong === "PONG" };
    } else {
      checks.redis = { ok: false, message: "Redis unconfigured or unreachable" };
    }
  } catch (err: unknown) {
    checks.redis = {
      ok: false,
      message: err instanceof Error ? err.message : "Redis check failed",
    };
  }

  const allHealthy = checks.mongodb.ok;
  const status = allHealthy ? 200 : 503;

  return NextResponse.json(
    {
      ready: allHealthy,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
