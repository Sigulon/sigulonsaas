import { NextRequest, NextResponse } from "next/server";
import { CallRepository, BillingRepository } from "@sigulon/database";
import { reserveEstimateCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = process.env.INTERNAL_API_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized internal call" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const callId = body?.call_id as string | undefined;
    if (!callId) {
      return NextResponse.json({ error: "call_id is required" }, { status: 400 });
    }

    const call = await CallRepository.findById(callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const res = await BillingRepository.reserveCallCredits({
      organizationId: call.organizationId,
      callId: call._id,
      estimate: reserveEstimateCredits(),
    });

    return NextResponse.json({
      ok: true,
      did_reserve: res.didReserve,
      insufficient: res.insufficient,
      balance: res.balance,
      reserved_credits: res.reserved,
      available: res.available,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
