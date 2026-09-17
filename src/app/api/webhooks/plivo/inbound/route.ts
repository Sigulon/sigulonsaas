import { NextRequest, NextResponse } from "next/server";
import {
  CallRepository,
  PhoneNumberRepository,
  AgentRepository,
  OrganizationRepository,
  ContactRepository,
} from "@sigulon/database";
import { toCanonicalAgentConfig } from "@/lib/agent-config";
import {
  CARTESIA_STT_PROVIDER,
  OPENROUTER_GEMINI_25_FLASH,
  type VoiceAgent,
} from "@/lib/types";
import { normalizePhone } from "@/lib/phone";
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

const XML_HEADERS = { "Content-Type": "text/xml" };

function xmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: XML_HEADERS });
}

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
  try {
    const params = formToParams(await req.formData());
    const p = params as PlivoAnswerParams;
    const to = p.To || "";

    // Resolve the dialed line before trusting the request. That gives a BYOC
    // workspace exactly its own Plivo signing token for validation.
    const normalizedTo = normalizePhone(to) || to;
    const numberRow = await PhoneNumberRepository.findByNumber(normalizedTo);

    // 1. Signature gate
    const authToken = await getPlivoWebhookTokenForOrg(
      numberRow?.provider === "plivo" ? numberRow.organizationId.toString() : null
    );
    if (!authToken) {
      console.error("[plivo/inbound] no Plivo signing token is configured");
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
      nonceV2: h("x-plivo-signature-v2"),
      authToken,
    });
    if (!valid) {
      console.warn("[plivo/inbound] invalid signature; rejecting");
      return new NextResponse("Invalid webhook signature", { status: 403 });
    }

    const from = p.From || "";
    const providerCallId = p.CallUUID || "";

    if (!to || !providerCallId) {
      console.warn("[plivo/inbound] missing To/CallUUID; rejecting politely");
      return xmlResponse(
        buildRejectionXml(
          "We're unable to take your call right now. Please try again later."
        )
      );
    }

    const runtimeBase = runtimeHttpBase();
    if (!runtimeBase) {
      console.error("[plivo/inbound] VOICE_RUNTIME_URL is not configured");
      return xmlResponse(
        buildRejectionXml(
          "We're unable to take your call right now. Please try again later."
        )
      );
    }

    // 2. Idempotency: redelivery for known providerCallId
    const existingCall = await CallRepository.findByProviderCallId(providerCallId);
    if (existingCall) {
      console.log(
        `[plivo/inbound] redelivery for known call ${existingCall._id}; re-answering`
      );
      return xmlResponse(
        buildInboundAnswerXml({
          streamUrl: plivoStreamUrl(runtimeBase, existingCall._id.toString()),
          statusCallbackUrl: `${runtimeBase}/plivo/status-callback`,
        })
      );
    }

    // 3. Resolve the registered Plivo number and its agent.
    if (!numberRow || numberRow.provider !== "plivo" || !numberRow.agentId) {
      console.warn(
        `[plivo/inbound] no agent mapped for dialed number ending …${to.slice(-4)}`
      );
      return xmlResponse(
        buildRejectionXml(
          "The number you dialed is not in service. Please check the number and try again."
        )
      );
    }

    // 4. Resolve agent & organization
    const orgId = numberRow.organizationId.toString();
    const agent = await AgentRepository.findById(numberRow.agentId, orgId);
    if (!agent || agent.status !== "active") {
      console.warn(`[plivo/inbound] agent ${numberRow.agentId} missing or inactive`);
      return xmlResponse(
        buildRejectionXml(
          "This line is currently unavailable. Please try again later."
        )
      );
    }

    const org = await OrganizationRepository.findById(orgId);
    const llmProvider: NonNullable<VoiceAgent["llm_provider"]> = "openrouter";

    // 5. Caller contact
    let contactId: typeof agent._id | null = null;
    const normalizedFrom = normalizePhone(from);
    if (normalizedFrom) {
      let contact = await ContactRepository.findByNormalizedPhone(orgId, normalizedFrom);
      if (!contact) {
        contact = await ContactRepository.create({
          organizationId: orgId,
          phone: from,
          normalizedPhone: normalizedFrom,
          source: "plivo-inbound",
        });
      }
      contactId = contact._id;
    }

    // 6. Create call record
    const call = await CallRepository.create({
      organizationId: orgId,
      agentId: agent._id,
      agentVersionId: agent.currentVersionId,
      ...(contactId ? { contactId } : {}),
      phoneNumberId: numberRow._id,
      provider: "plivo",
      providerCallId,
      direction: "inbound",
      fromNumber: from,
      toNumber: to,
      status: "CREATED",
      metadata: {
        plivo_call_uuid: providerCallId,
        caller_name: p.CallerName || "",
      },
    });

    const callId = call._id.toString();

    // 7. Audit event
    await CallRepository.addEvent({
      callId: call._id,
      organizationId: orgId,
      type: "inbound.received",
      data: {
        to,
        from,
        agent_id: agent._id.toString(),
        provider_call_id: providerCallId,
      },
      idempotencyKey: `inbound:${providerCallId}`,
    });

    // 8. Redis pre-warm of canonical agent config
    try {
      const canonical = toCanonicalAgentConfig(
        {
          id: agent._id.toString(),
          org_id: orgId,
          name: agent.name,
          language: agent.config.identity.language,
          voice_id: agent.config.voice.voiceId,
          system_prompt: agent.config.instructions.systemPrompt,
          introduction: agent.config.instructions.greeting,
          status: agent.status,
          llm_provider: llmProvider,
          llm_model: OPENROUTER_GEMINI_25_FLASH,
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
    } catch (err) {
      console.warn(`[plivo/inbound] redis pre-warm failed for call ${callId}:`, err);
    }

    // 9. Answer XML: every accepted call streams to Pipecat/Cartsia.
    return xmlResponse(
      buildInboundAnswerXml({
        streamUrl: plivoStreamUrl(runtimeBase, callId),
        statusCallbackUrl: `${runtimeBase}/plivo/status-callback`,
      })
    );
  } catch (err: unknown) {
    console.error("[plivo/inbound] unhandled error answering call:", err);
    return xmlResponse(
      buildRejectionXml(
        "We're unable to take your call right now. Please try again later."
      )
    );
  }
}
