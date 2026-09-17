import { NextRequest, NextResponse } from "next/server";
import { CallRepository, CampaignModel, type CallState } from "@sigulon/database";
import { defaultCartesiaClient } from "@/lib/cartesia";

interface WebhookEventPayload {
  event: "call.started" | "call.ended" | "call.recording.ready" | "call.transcript.ready";
  call_id: string;
  timestamp?: string;
  data?: {
    duration_seconds?: number;
    status?: string;
    recording_url?: string;
    transcript?: { role: "agent" | "user" | "system"; text: string; timestamp?: string }[];
    disposition?: string;
    outcome?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-cartesia-signature") || "";
    const webhookSecret = process.env.CARTESIA_WEBHOOK_SECRET || "";

    // 1. Verify every public webhook; an unset secret is a deployment error.
    if (!webhookSecret) {
      console.error("[cartesia/webhook] CARTESIA_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
    }
    const isValid = defaultCartesiaClient.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const payload: WebhookEventPayload = JSON.parse(rawBody);
    const { event, call_id, data } = payload;

    if (!call_id) {
      return NextResponse.json({ error: "Missing call_id" }, { status: 400 });
    }

    // 2. Fetch the corresponding call record using providerCallId or metadata
    const callRecord = await CallRepository.findByProviderCallId(call_id);

    if (!callRecord) {
      console.warn(`Webhook received for unknown cartesia_call_id: ${call_id}`);
      return NextResponse.json({ message: "Call record not found, acknowledged" }, { status: 200 });
    }

    // 3. Process event types
    const updates: Record<string, unknown> = {};

    switch (event) {
      case "call.started": {
        // Idempotency: only move to in_progress from initial states
        const initialStates = ["QUEUED", "DIALING", "RINGING"];
        if (!initialStates.includes(callRecord.status)) {
          console.log(`call.started skipped — call ${callRecord._id} already in status '${callRecord.status}'`);
          return NextResponse.json({ success: true, event, skipped: true });
        }
        await CallRepository.transitionState(callRecord._id, "IN_PROGRESS", {
          startedAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        });
        break;
      }

      case "call.ended": {
        const terminalStatuses = ["COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "CANCELLED"];
        if (terminalStatuses.includes(callRecord.status)) {
          console.log(`call.ended skipped — call ${callRecord._id} already in terminal status '${callRecord.status}'`);
          return NextResponse.json({ success: true, event, skipped: true });
        }

        const duration = data?.duration_seconds ?? 0;
        const requestedStatus = typeof data?.status === "string"
          ? data.status.toUpperCase()
          : duration > 0 ? "COMPLETED" : "NO_ANSWER";
        const terminalStates = new Set<CallState>([
          "COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "CANCELLED",
        ]);
        const finalStatus: CallState = terminalStates.has(requestedStatus as CallState)
          ? requestedStatus as CallState
          : duration > 0 ? "COMPLETED" : "NO_ANSWER";
        updates.durationSeconds = duration;
        updates.endedAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

        await CallRepository.transitionState(callRecord._id, finalStatus, updates);

        if (callRecord.campaignId) {
          await CampaignModel.findByIdAndUpdate(callRecord.campaignId, {
            $inc: { callsCompleted: 1 },
          });
        }
        break;
      }

      case "call.recording.ready": {
        if (data?.recording_url) {
          await CallRepository.saveRecording({
            callId: callRecord._id,
            organizationId: callRecord.organizationId,
            storageProvider: "cartesia",
            bucket: "cartesia-recordings",
            objectKey: data.recording_url,
            durationSeconds: data.duration_seconds || 0,
            status: "ready",
          });
        }
        break;
      }

      case "call.transcript.ready": {
        if (data?.transcript) {
          const formattedTranscript = data.transcript.map((t) => ({
            speaker: (t.role === "agent" ? "agent" : "user") as "agent" | "user",
            text: t.text,
            timestampMs: 0,
          }));
          await CallRepository.saveTranscript(
            callRecord._id,
            callRecord.organizationId,
            formattedTranscript
          );
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    return NextResponse.json({ success: true, event });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Webhook Processing Failed";
    console.error("Webhook error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
