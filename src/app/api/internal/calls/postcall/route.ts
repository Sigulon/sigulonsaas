import { NextRequest, NextResponse } from "next/server";
import { CallRepository } from "@sigulon/database";
import { sendCallSummaryNotification } from "@/lib/email";

export const dynamic = "force-dynamic";

// Worker postcall fan-out: POST {call_id, transcript, summary, outcome, duration_seconds}.
// Persists transcript + summary/outcome on the Call, then notifies the owner
// (WhatsApp/email fan-out lives in the control plane, not the worker).
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized internal call" }, { status: 401 });
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
    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
    const summary = typeof body?.summary === "string" ? body.summary : "";
    const outcome = typeof body?.outcome === "string" ? body.outcome : "completed";
    const durationSeconds = Math.max(0, Number(body?.duration_seconds ?? 0) || 0);

    await CallRepository.saveTranscript(call._id, call.organizationId, transcript.map((t: { role?: string; text?: string }) => ({
      speaker: t.role === "user" ? "user" : "agent",
      text: String(t.text || ""),
    }))).catch(() => null);
    const capturedVariables =
      body?.captured_variables && typeof body.captured_variables === "object"
        ? body.captured_variables
        : {};

    await CallRepository.saveOutcome(call._id, call.organizationId, {
      disposition: outcome,
      customFields: capturedVariables,
    }).catch(() => null);

    const { CallModel } = await import("@sigulon/database");
    await CallModel.findOneAndUpdate(
      { _id: call._id, organizationId: call.organizationId },
      {
        $set: {
          ...(summary ? { summary } : {}),
          ...(durationSeconds > 0 ? { durationSeconds } : {}),
          "metadata.captured_variables": capturedVariables,
        },
      }
    ).exec().catch(() => null);

    // Owner notify (best-effort; never fails the postcall).
    try {
      await sendCallSummaryNotification({
        callId: call._id.toString(),
        organizationId: call.organizationId.toString(),
        summary,
        outcome,
        durationSeconds,
      });
    } catch (err) {
      console.warn(`[internal/postcall] owner notify failed for ${callId}:`, err);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
