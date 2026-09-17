import { NextRequest, NextResponse } from "next/server";
import { CallRepository, CallModel } from "@sigulon/database";
import { getPlivoWebhookTokenForOrg } from "@/lib/plivo-credentials";
import { publicUrlCandidates, verifyPlivoSignature } from "@/lib/plivo";

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
    const callId = req.nextUrl.searchParams.get("call_id") || "";
    const callUuid = params.CallUUID || "";
    const recordUrl = params.RecordUrl || params.record_url || "";
    const duration = parseInt(
      params.RecordingDuration || params.recording_duration || "0",
      10
    );

    const call = callId
      ? await CallRepository.findById(callId)
      : await CallRepository.findByProviderCallId(callUuid);

    if (!call) {
      console.warn(`[plivo/recording] call not found for id ${callId || callUuid}`);
      return NextResponse.json({ success: true, warning: "Call not found" });
    }

    const authToken = await getPlivoWebhookTokenForOrg(call.organizationId.toString());
    if (!authToken) {
      console.error("[plivo/recording] no Plivo signing token is configured");
      return NextResponse.json({ error: "Telephony webhook is not configured" }, { status: 503 });
    }
    const h = (name: string) => req.headers.get(name);
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
      console.warn(`[plivo/recording] invalid signature for call ${call._id}`);
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 403 });
    }

    if (!recordUrl) {
      console.warn("[plivo/recording] missing RecordUrl; ignoring");
      return NextResponse.json({ success: false, error: "Missing RecordUrl" }, { status: 400 });
    }

    console.log(`[plivo/recording] accepted callId=${call._id}, duration=${duration}s`);

    // Save recording record into MongoDB
    const recording = await CallRepository.saveRecording({
      callId: call._id,
      organizationId: call.organizationId,
      storageProvider: "plivo",
      bucket: "plivo-telephony",
      objectKey: recordUrl,
      durationSeconds: duration,
      format: "audio/mp3",
      status: "ready",
    });

    // Also store recordingUrl directly in CallModel metadata for instant playback
    await CallModel.findByIdAndUpdate(call._id, {
      recordingId: recording._id,
      $set: {
        "metadata.recordingUrl": recordUrl,
        "metadata.recordUrl": recordUrl,
      },
    }).exec();

    console.log(`[plivo/recording] saved recording for call ${call._id}`);

    return NextResponse.json({
      success: true,
      call_id: call._id.toString(),
      recording_id: recording._id.toString(),
      recording_url: recordUrl,
    });
  } catch (err) {
    console.error("[plivo/recording] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
