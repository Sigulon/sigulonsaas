import { NextRequest, NextResponse } from "next/server";
import {
  CallRepository,
  CampaignRepository,
  CampaignContactModel,
  CallState,
} from "@sigulon/database";
import { computeUsageCredits, settleCallCredits } from "@/lib/credits";
import { getPlivoWebhookTokenForOrg } from "@/lib/plivo-credentials";
import {
  TERMINAL_CALL_STATUSES,
  mapPlivoStatus,
  publicUrlCandidates,
  verifyPlivoSignature,
  type PlivoStatusParams,
} from "@/lib/plivo";

export const dynamic = "force-dynamic";

function formToParams(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const params = formToParams(await req.formData());
    const p = params as PlivoStatusParams;
    const providerCallId = p.CallUUID || "";
    if (!providerCallId) {
      return NextResponse.json({ error: "Missing CallUUID" }, { status: 400 });
    }

    // Both outbound status URLs and inbound calls can identify their local
    // record before validation. The lookup selects a workspace's token only;
    // state changes remain behind the signature gate.
    const localCallId = req.nextUrl.searchParams.get("call_id");
    const call = localCallId
      ? await CallRepository.findById(localCallId)
      : await CallRepository.findByProviderCallId(providerCallId);

    const authToken = await getPlivoWebhookTokenForOrg(call?.organizationId.toString());
    if (!authToken) {
      console.error("[plivo/status] no Plivo signing token is configured");
      return NextResponse.json({ error: "Telephony webhook is not configured" }, { status: 503 });
    }
    const h = (n: string) => req.headers.get(n);
    const valid = verifyPlivoSignature({
      urls: publicUrlCandidates({ url: req.url, getHeader: h }),
      params,
      signatureV3: h("x-plivo-signature-v3"),
      signatureMaV3: h("x-plivo-signature-ma-v3"),
      nonceV3: h("x-plivo-signature-v3-nonce"),
      signatureV2: h("x-plivo-signature-v2"),
      signatureMaV2: h("x-plivo-signature-ma-v2"),
      nonceV2: h("x-plivo-signature-v2-nonce"),
      authToken,
    });
    if (!valid) {
      console.warn("[plivo/status] invalid signature; candidates:", publicUrlCandidates({ url: req.url, getHeader: h }));
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 403 }
      );
    }

    // The outbound worker includes the opaque local id in the signed status
    // URL. Plivo does not hit the answer callback for busy/no-answer legs, so
    // CallUUID has not been stored yet on those calls.
    if (!call) {
      console.warn(
        `[plivo/status] unknown provider_call_id ${providerCallId} (status=${p.CallStatus ?? "?"})`
      );
      return NextResponse.json({ success: true, unknown: true });
    }

    const callStatus = p.CallStatus ?? "unknown";
    const duration = Math.max(
      0,
      parseInt(p.BillDuration ?? p.Duration ?? "0", 10) || 0
    );

    // 1. Audit event (deduped on providerCallId + callStatus). A null result
    // is a redelivery, so it must not charge or increment campaign metrics.
    await CallRepository.addEvent({
      callId: call._id,
      organizationId: call.organizationId,
      type: `plivo.${callStatus}`,
      data: {
        raw_status: callStatus,
        duration,
        hangup_cause: p.HangupCause ?? null,
      },
      idempotencyKey: `plivo:${providerCallId}:${callStatus}`,
    });

    const mapped = mapPlivoStatus(callStatus);
    if (!mapped) {
      console.warn(`[plivo/status] ignoring unrecognized status ${callStatus}`);
      return NextResponse.json({
        success: true,
        call_id: call._id.toString(),
        ignored: true,
      });
    }
    const mappedStatus = mapped.toUpperCase() as CallState;
    const isTerminal = TERMINAL_CALL_STATUSES.has(mappedStatus.toLowerCase());

    const updates: Record<string, unknown> = {};
    if (call.providerCallId !== providerCallId) {
      updates.providerCallId = providerCallId;
    }
    if (duration > 0 && (!call.durationSeconds || duration > call.durationSeconds)) {
      updates.durationSeconds = duration;
    }
    if (isTerminal && !call.endedAt) {
      updates.endedAt = new Date();
    }

    await CallRepository.transitionState(call._id, mappedStatus, updates);
    // Billing and campaign accounting must execute once across *all* terminal
    // provider statuses. Plivo can race a `failed` callback with a later
    // `completed`/`cancelled` redelivery; status-specific audit keys alone do
    // not protect that side effect.
    const terminalEvent = isTerminal
      ? await CallRepository.addEvent({
          callId: call._id,
          organizationId: call.organizationId,
          type: "call.terminalized",
          data: { status: mappedStatus, duration },
          idempotencyKey: `terminal:${call._id}`,
        })
      : null;

    // 2. Billing and campaign accounting happen once when the call first
    // terminalizes. Status webhooks are routinely retried by Plivo.
    if (isTerminal && terminalEvent) {
      const usageCredits =
        mappedStatus === "COMPLETED" && duration > 0
          ? computeUsageCredits(duration)
          : 0;

      try {
        await settleCallCredits(null, call.organizationId.toString(), call._id.toString(), usageCredits);
      } catch (err) {
        console.error(`[plivo/status] billing settle failed for call ${call._id}:`, err);
      }

      // 3. Campaign tracking. Mirror the terminal call state immediately so
      // campaign completion does not wait for the stale-call sweeper.
      if (call.campaignId && call.contactId) {
        const contactStatus =
          mappedStatus === "COMPLETED"
            ? "completed"
            : mappedStatus === "BUSY"
              ? "busy"
              : mappedStatus === "NO_ANSWER"
                ? "no_answer"
                : "failed";
        await CampaignContactModel.findOneAndUpdate(
          {
            campaignId: call.campaignId,
            contactId: call.contactId,
            organizationId: call.organizationId,
            callStatus: { $in: ["pending", "queued", "dialing", "ringing", "answered"] },
          },
          { $set: { callStatus: contactStatus, lastAttemptAt: new Date() } }
        ).exec();
        await CampaignRepository.incrementCompletedCalls(call.campaignId);
        await CampaignRepository.checkAndMarkCompletion(call.campaignId);
      }
    }

    return NextResponse.json({
      success: true,
      call_id: call._id.toString(),
      status: mappedStatus,
    });
  } catch (err: unknown) {
    console.error("[plivo/status] webhook processing error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
