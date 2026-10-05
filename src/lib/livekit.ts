/**
 * LiveKit Cloud helpers for the Sigulon control plane.
 *
 * Telephony path: Plivo number -> Plivo inbound Zentrunk (SIP URI pointing at
 * `<project-sip-subdomain>.sip.livekit.cloud`) -> LiveKit inbound trunk ->
 * room + SIP participant -> dispatch rule -> voice-runtime worker
 * (`sigulon-voice-agent`, job metadata {orgId, agentId}).
 *
 * Outbound: campaign-worker -> LiveKit API (room + AgentDispatch +
 * SIP participant via org outbound trunk -> Plivo termination).
 */

import crypto from "crypto";

export const LIVEKIT_AGENT_NAME =
  process.env.LIVEKIT_AGENT_NAME || "sigulon-voice-agent";

export interface DispatchMetadata {
  orgId: string;
  tenantId?: string;
  agentId: string;
  callId?: string;
  phoneNumber?: string;
  campaignId?: string;
  workflowId?: string;
  customerContext?: Record<string, unknown>;
  promptInjection?: string;
  voiceId?: string;
  direction?: "inbound" | "outbound";
  room?: string;
}

export function buildDispatchMetadata(meta: DispatchMetadata): string {
  const tenantId = meta.tenantId || meta.orgId;
  return JSON.stringify({
    orgId: tenantId,
    tenant_id: tenantId,
    agentId: meta.agentId,
    agent_id: meta.agentId,
    ...(meta.callId ? { callId: meta.callId, call_id: meta.callId } : {}),
    ...(meta.phoneNumber ? { phoneNumber: meta.phoneNumber, phone_number: meta.phoneNumber } : {}),
    ...(meta.campaignId ? { campaignId: meta.campaignId, campaign_id: meta.campaignId } : {}),
    ...(meta.workflowId ? { workflowId: meta.workflowId, workflow_id: meta.workflowId } : {}),
    ...(meta.customerContext ? { customerContext: meta.customerContext, customer_context: meta.customerContext } : {}),
    ...(meta.promptInjection ? { promptInjection: meta.promptInjection, prompt_injection: meta.promptInjection } : {}),
    ...(meta.voiceId ? { voiceId: meta.voiceId, voice_id: meta.voiceId } : {}),
    direction: meta.direction || "inbound",
    ...(meta.room ? { room: meta.room } : {}),
  });
}

export function parseDispatchMetadata(raw: string | null | undefined): DispatchMetadata | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const orgId = String(data.tenant_id || data.tenantId || data.orgId || data.org_id || "");
    const agentId = String(data.agent_id || data.agentId || "");
    if (!orgId || !agentId) return null;
    return {
      orgId,
      tenantId: orgId,
      agentId,
      callId: data.callId ? String(data.callId) : data.call_id ? String(data.call_id) : undefined,
      phoneNumber: data.phoneNumber ? String(data.phoneNumber) : data.phone_number ? String(data.phone_number) : undefined,
      campaignId: data.campaignId ? String(data.campaignId) : data.campaign_id ? String(data.campaign_id) : undefined,
      workflowId: data.workflowId ? String(data.workflowId) : data.workflow_id ? String(data.workflow_id) : undefined,
      customerContext: (data.customerContext || data.customer_context) as Record<string, unknown> | undefined,
      promptInjection: data.promptInjection ? String(data.promptInjection) : data.prompt_injection ? String(data.prompt_injection) : undefined,
      voiceId: data.voiceId ? String(data.voiceId) : data.voice_id ? String(data.voice_id) : undefined,
      direction: data.direction === "outbound" ? "outbound" : "inbound",
      room: data.room ? String(data.room) : undefined,
    };
  } catch {
    return null;
  }
}

/** Room name for a call (1:1 room <-> session). Outbound dispatch creates it. */
export function roomNameForCall(callId: string): string {
  return `sigulon-call-${callId}`;
}

/** LiveKit SIP subdomain for Zentrunk URIs (project-specific). */
export function livekitSipDomain(): string {
  const url = process.env.LIVEKIT_URL || "";
  // wss://my-project.livekit.cloud -> my-project.sip.livekit.cloud
  const m = url.match(/\/\/([^.]+)\.livekit\.cloud/i);
  if (m) return `${m[1]}.sip.livekit.cloud`;
  return "<project-sip-subdomain>.sip.livekit.cloud";
}

/** Plivo Zentrunk SIP URI pointing at this project's LiveKit Cloud. */
export function zentrunkUriForProject(transport: "tcp" | "tls" = "tcp"): string {
  return `${livekitSipDomain()};transport=${transport}`;
}

export function livekitEnv(): { url: string; apiKey: string; apiSecret: string; webhookSecret: string } {
  return {
    url: process.env.LIVEKIT_URL || "",
    apiKey: process.env.LIVEKIT_API_KEY || "",
    apiSecret: process.env.LIVEKIT_API_SECRET || "",
    webhookSecret: process.env.LIVEKIT_WEBHOOK_SECRET || "",
  };
}

export function isLivekitConfigured(): boolean {
  const e = livekitEnv();
  return Boolean(e.url && e.apiKey && e.apiSecret);
}

/** Dual-run flag: keep Plivo status reconciliation during migration window. */
export function isPlivoDualRunEnabled(): boolean {
  return (process.env.PLIVO_DUAL_RUN || "true").toLowerCase() !== "false";
}

export function hashPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export const LIVEKIT_INFERENCE_GATEWAY = "https://agent-gateway.livekit.cloud/v1";
export const LIVEKIT_DEFAULT_LLM = "google/gemini-2.5-flash";

/**
 * Creates an inference access token (JWT) for LiveKit Cloud's hosted AI models.
 */
export function createLiveKitInferenceToken(
  apiKey: string = process.env.LIVEKIT_API_KEY || "",
  apiSecret: string = process.env.LIVEKIT_API_SECRET || "",
  ttlSeconds: number = 600
): string {
  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required for LiveKit Inference");
  }
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    inference: { perform: true },
    sub: "agent",
    iss: apiKey,
    nbf: now - 5,
    exp: now + ttlSeconds,
  };

  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsignedToken = `${b64(header)}.${b64(payload)}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(unsignedToken).digest("base64url");
  return `${unsignedToken}.${signature}`;
}

/**
 * Executes chat completion directly against LiveKit Cloud hosted inference.
 * Uses Google Gemini 2.5 Flash via LiveKit without third-party LLM providers.
 */
export async function generateLiveKitChatCompletion(params: {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const {
    messages,
    systemPrompt,
    model = LIVEKIT_DEFAULT_LLM,
    temperature = 0.7,
    maxTokens = 150,
  } = params;

  const token = createLiveKitInferenceToken();

  const formattedMessages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    formattedMessages.push({
      role: "system",
      content: `${systemPrompt}\n\nKeep spoken voice replies natural, polite, and at most 2 short sentences. Do not use asterisks, markdown, emojis, or bullet points.`,
    });
  }

  for (const m of messages) {
    if (m.role && m.content) {
      formattedMessages.push({
        role: m.role === "assistant" || m.role === "agent" ? "assistant" : "user",
        content: String(m.content),
      });
    }
  }

  const res = await fetch(`${LIVEKIT_INFERENCE_GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`LiveKit Inference error (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const reply = data.choices?.[0]?.message?.content?.trim() || "";
  return reply;
}

