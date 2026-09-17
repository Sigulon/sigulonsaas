/**
 * Plivo transfer-target XML (`?call_id=`) — fetched by Plivo during a
 * `transfer_call` tool handoff (aleg_url).
 *
 * Toll-fraud safety: the destination is NEVER caller-supplied. This route
 * loads the call's agent and dials exactly its configured
 * `settings.transfer_number`. No agent number (or no live call) → Hangup,
 * so a forged fetch can't steer audio anywhere.
 *
 * Signature-checked like the other Plivo webhooks (Plivo signs Transfer
 * fetches too).
 */

import { NextRequest, NextResponse } from "next/server";
import { CallRepository, AgentRepository } from "@sigulon/database";
import { getPlivoWebhookTokenForOrg } from "@/lib/plivo-credentials";
import {
  publicUrlCandidates,
  verifyPlivoSignature,
} from "@/lib/plivo";

export const dynamic = "force-dynamic";

const xml = (body: string) =>
  new NextResponse(body, { headers: { "Content-Type": "text/xml" } });

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formToParams(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

const hangup = () =>
  xml(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Hangup />\n</Response>`);

async function handler(req: NextRequest) {
  try {
    const params =
      req.method === "POST" ? formToParams(await req.formData()) : {};
    const callId = new URL(req.url).searchParams.get("call_id") || "";
    if (!callId) return hangup();

    // Select the right workspace token before validating the request. A
    // forged call id cannot cause a transfer: only a valid signature reaches
    // the state and agent checks below.
    const call = await CallRepository.findById(callId);
    if (!call) return hangup();

    const authToken = await getPlivoWebhookTokenForOrg(call.organizationId.toString());
    if (!authToken) {
      console.error("[plivo/transfer-target] no Plivo signing token is configured");
      return new NextResponse("Telephony webhook is not configured", { status: 503 });
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
      return new NextResponse("Invalid webhook signature", { status: 403 });
    }

    const liveStatuses = ["ANSWERED", "IN_PROGRESS", "RINGING"];
    if (!liveStatuses.includes(call.status.toUpperCase())) {
      return hangup();
    }

    const agent = await AgentRepository.findById(
      call.agentId.toString(),
      call.organizationId.toString()
    );
    if (!agent) return hangup();

    const transferNumber = agent.config?.settings?.transferNumber?.trim() || "";
    if (!transferNumber) return hangup();

    return xml(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<Response>\n` +
        `  <Speak>Connecting you now, please hold.</Speak>\n` +
        `  <Dial><Number>${escXml(transferNumber)}</Number></Dial>\n` +
        `</Response>`
    );
  } catch (err) {
    console.error(
      "[plivo/transfer-target] error:",
      err instanceof Error ? err.message : err
    );
    return hangup();
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
