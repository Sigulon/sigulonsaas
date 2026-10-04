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
  agentId: string;
  callId?: string;
  direction?: "inbound" | "outbound";
  room?: string;
}

export function buildDispatchMetadata(meta: DispatchMetadata): string {
  return JSON.stringify({
    orgId: meta.orgId,
    agentId: meta.agentId,
    ...(meta.callId ? { callId: meta.callId } : {}),
    direction: meta.direction || "inbound",
    ...(meta.room ? { room: meta.room } : {}),
  });
}

export function parseDispatchMetadata(raw: string | null | undefined): DispatchMetadata | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const orgId = String(data.orgId || data.org_id || "");
    const agentId = String(data.agentId || data.agent_id || "");
    if (!orgId || !agentId) return null;
    return {
      orgId,
      agentId,
      callId: data.callId ? String(data.callId) : undefined,
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
