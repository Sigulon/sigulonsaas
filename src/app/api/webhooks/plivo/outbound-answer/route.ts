import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import {
  CallRepository,
  AgentRepository,
  OrganizationRepository,
  ContactRepository,
} from "@sigulon/database";
import { reserveCallCredits } from "@/lib/credits";
import { toCanonicalAgentConfig } from "@/lib/agent-config";
import {
  CARTESIA_STT_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
  type VoiceAgent,
} from "@/lib/types";
import { prewarmCallConfig } from "@/lib/redis";
import { getPlivoWebhookTokenForOrg } from "@/lib/plivo-credentials";
import {
  buildInboundAnswerXml,
  buildRejectionXml,
  plivoStreamUrl,
  publicUrlCandidates,
  verifyPlivoSignature,
  type PlivoAnswerParams,
} from "@/lib/plivo";

export const dynamic = "force-dynamic";

const ANSWERABLE = new Set(["QUEUED", "DIALING", "RINGING"]);

function formToParams(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function runtimeHttpBase(): string | null {
  const configuredBase = process.env.VOICE_RUNTIME_URL || "";
  const base = configuredBase.replace(/\/+$/, "");
  if (!base) return null;
  if (base.startsWith("wss://")) return `https://${base.slice("wss://".length)}`;
  if (base.startsWith("ws://")) return `http://${base.slice("ws://".length)}`;
  return base;
}

export async function POST(req: NextRequest) {
  const xml = (body: string) =>
    new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
  try {
    const params = formToParams(await req.formData());
    const p = params as PlivoAnswerParams;
    const callId = req.nextUrl.searchParams.get("call_id") || "";
    if (!callId) {
      console.warn("[plivo/outbound-answer] missing call_id; rejecting");
      return xml(buildRejectionXml("We're unable to complete your call right now. Please try again later."));
    }

    // The opaque local id is bound into the worker's signed callback URL.
    // Look up its organization only to select the signing token; do not alter
    // call state until the signature below has passed.
    const call = await CallRepository.findById(callId);
    if (!call || call.direction !== "outbound") {
      console.warn(`[plivo/outbound-answer] unknown or non-outbound call ${callId}`);
      return xml(buildRejectionXml("We're unable to complete your call right now. Please try again later."));
    }

    const authToken = await getPlivoWebhookTokenForOrg(call.organizationId.toString());
    if (!authToken) {
      console.error("[plivo/outbound-answer] no Plivo signing token is configured");
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
      console.warn("[plivo/outbound-answer] invalid signature; candidates:", publicUrlCandidates({ url: req.url, getHeader: h }));
      return new NextResponse("Invalid webhook signature", { status: 403 });
    }

    const providerCallId = p.CallUUID || "";

    if (!providerCallId) {
      console.warn("[plivo/outbound-answer] missing CallUUID; rejecting");
      return xml(
        buildRejectionXml(
          "We're unable to complete your call right now. Please try again later."
        )
      );
    }

    const runtimeBase = runtimeHttpBase();
    if (!runtimeBase) {
      console.error("[plivo/outbound-answer] VOICE_RUNTIME_URL is not configured");
      return xml(
        buildRejectionXml(
          "We're unable to complete your call right now. Please try again later."
        )
      );
    }

    // Idempotent redelivery
    if (call.status === "ANSWERED" || call.status === "IN_PROGRESS") {
      console.log(`[plivo/outbound-answer] redelivery for call ${callId}; replaying`);
      return xml(
        buildInboundAnswerXml({
          streamUrl: plivoStreamUrl(runtimeBase, callId),
          statusCallbackUrl: `${runtimeBase}/plivo/status-callback`,
        })
      );
    }

    if (!ANSWERABLE.has(call.status)) {
      console.warn(
        `[plivo/outbound-answer] call ${callId} in un-answerable status ${call.status}`
      );
      return xml(
        buildRejectionXml(
          "We're unable to complete your call right now. Please try again later."
        )
      );
    }

    // Bind providerCallId, transition to ANSWERED
    await CallRepository.transitionState(call._id, "ANSWERED", {
      providerCallId,
      answeredAt: new Date(),
    });

    // Audit event
    await CallRepository.addEvent({
      callId: call._id,
      organizationId: call.organizationId,
      type: "outbound.answered",
      data: {
        provider_call_id: providerCallId,
      },
      idempotencyKey: `answer:${callId}`,
    });

    // These are durable/idempotent follow-up operations. Do not make Plivo
    // wait for an extra Mongo transaction or Redis connection before it can
    // open the media socket; the runtime also sends the same billing hold.
    after(async () => {
      try {
        await reserveCallCredits(null, call.organizationId.toString(), call._id.toString());
      } catch (err) {
        console.warn(`[plivo/outbound-answer] credit hold failed for call ${callId}:`, err);
      }
    });

    // Pre-warm config after the XML has been returned. MongoDB remains the
    // runtime's source of truth if this optional Redis cache write is late.
    after(async () => {
      try {
        const agent = await AgentRepository.findById(call.agentId, call.organizationId);
        const org = await OrganizationRepository.findById(call.organizationId);
        if (agent) {
        let intro = agent.config.instructions.greeting;
        let leadName: string | undefined = undefined;
        if (call.contactId) {
          try {
            const contact = await ContactRepository.findById(call.contactId, call.organizationId);
            if (contact?.name) {
              leadName = contact.name;
            }
          } catch {
            // ignore
          }
        }
        if (!leadName && call.metadata && typeof call.metadata === "object") {
          const meta = call.metadata as Record<string, unknown>;
          leadName = (meta.lead_name || meta.name || meta.customer_name) as string | undefined;
        }

        if (intro) {
          if (leadName) {
            intro = intro.replace(/\{\{?lead_name\}?\}/gi, leadName);
          } else {
            intro = intro
              .replace(/am I speaking with\s*\{\{?lead_name\}?\}\??/gi, "")
              .replace(/\{\{?lead_name\}?\}/gi, "")
              .replace(/\{\{[^}]+\}\}|\{[^}]+\}/g, "")
              .replace(/\s+,/g, ",")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        const llmProvider: NonNullable<VoiceAgent["llm_provider"]> = "openrouter";
        const canonical = toCanonicalAgentConfig(
          {
            id: agent._id.toString(),
            org_id: call.organizationId.toString(),
            name: agent.name,
            language: agent.config.identity.language,
            voice_id: agent.config.voice.voiceId,
            system_prompt: agent.config.instructions.systemPrompt,
            introduction: intro,
            status: agent.status,
            llm_provider: llmProvider,
            llm_model: OPENROUTER_DEFAULT_MODEL,
            stt_provider: CARTESIA_STT_PROVIDER,
            enabled_tools: agent.config.tools.enabledTools,
            settings: agent.config.settings,
            bundle: agent.bundle,
            created_at: agent.createdAt.toISOString(),
            updated_at: agent.updatedAt.toISOString(),
          } satisfies VoiceAgent,
          org?.name || "Workspace"
        );
        await prewarmCallConfig(callId, canonical);
        }
      } catch (err) {
        console.warn(`[plivo/outbound-answer] redis prewarm failed for call ${callId}:`, err);
      }
    });

    return xml(
      buildInboundAnswerXml({
        streamUrl: plivoStreamUrl(runtimeBase, callId),
        statusCallbackUrl: `${runtimeBase}/plivo/status-callback`,
      })
    );
  } catch (err: unknown) {
    console.error("[plivo/outbound-answer] webhook error:", err);
    return xml(
      buildRejectionXml(
        "We're unable to complete your call right now. Please try again later."
      )
    );
  }
}
