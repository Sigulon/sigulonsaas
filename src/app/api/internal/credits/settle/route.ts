import { NextRequest, NextResponse } from "next/server";
import { CallRepository } from "@sigulon/database";
import { computeUsageCredits, settleCallCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

// Worker session-end settle: POST {call_id, duration_seconds}.
// Idempotent per call (settle:{call_id}); usage-only settle reconciles
// missing reservations so a missed reserve ping never corrupts balances.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized internal call" }, { status: 401 });
    }
    const body = await req.json();
    const callId = body?.call_id as string | undefined;
    const durationSeconds = Math.max(0, Number(body?.duration_seconds ?? 0) || 0);
    if (!callId) {
      return NextResponse.json({ error: "call_id is required" }, { status: 400 });
    }
    const call = await CallRepository.findById(callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    const usage = computeUsageCredits(durationSeconds);
    const res = await settleCallCredits(null, call.organizationId.toString(), call._id.toString(), usage);
    return NextResponse.json({ ok: true, settled: res.settled, usage: res.usage, refunded: res.refunded });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
