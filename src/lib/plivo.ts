/**
 * Plivo telephony helpers: webhook signature validation, answer XML, and
 * status mapping.
 *
 * Signature scheme (verified against Plivo voice docs, Apr 2026 —
 * `/docs/voice/concepts/signature-validation`):
 *   - Voice callbacks carry `X-Plivo-Signature-V3` (+ `-Ma-V3`, signed with
 *     the main-account token) and `X-Plivo-Signature-V3-Nonce`.
 *   - Message (POST) = `{fullUrl}.{k1}{v1}{k2}{v2}…{nonce}` — full URL with
 *     scheme/port/query, POST params sorted by key with values concatenated
 *     raw, nonce appended; segments joined by `.`.
 *   - Message (GET / no params) = `{fullUrl}.{nonce}`.
 *   - HMAC-SHA256 keyed by the auth token, base64-encoded. During token
 *     rotation Plivo sends comma-separated signatures — accept if ANY match.
 *   - Legacy V2 (`{baseUrl}{nonce}`, headers `X-Plivo-Signature-V2*`) is
 *     accepted as a fallback; V1/SHA1 is not.
 *
 * The answer XML shape here must stay identical to the runtime's
 * `providers/telephony.py::build_answer_xml` — both sides point Plivo at
 * `wss://<runtime>/voice-runtime/{call_id}`.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { authorizeRuntimeStreamUrl } from "./runtime-stream-auth";

// ---------------------------------------------------------------------------
// Signature validation
// ---------------------------------------------------------------------------

export interface PlivoSignatureInput {
  /** Candidate public URLs (forwarded-reconstructed first, req.url fallback). */
  urls: string[];
  /** Form-decoded POST params ({} for GET). Multi-values: last wins. */
  params: Record<string, string>;
  signatureV3: string | null;
  signatureMaV3: string | null;
  nonceV3: string | null;
  signatureV2: string | null;
  signatureMaV2: string | null;
  nonceV2: string | null;
  authToken: string;
}

function b64hmac(token: string, message: string): string {
  return createHmac("sha256", token).update(message, "utf8").digest("base64");
}

/** Split a possibly comma-separated (rotation) signature header. */
function splitSignatures(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** V3 message: `{url}.{sorted k+v…}.{nonce}` (params segment omitted when empty). */
export function v3Message(
  url: string,
  params: Record<string, string>,
  nonce: string
): string {
  const keys = Object.keys(params).sort();
  const joined = keys.map((k) => `${k}${params[k]}`).join("");
  return joined ? `${url}.${joined}.${nonce}` : `${url}.${nonce}`;
}

/** V2 message: `{url}{nonce}` (no separator, no params). */
export function v2Message(url: string, nonce: string): string {
  return `${url}${nonce}`;
}

export function verifyPlivoSignature(input: PlivoSignatureInput): boolean {
  const {
    urls,
    params,
    signatureV3,
    signatureMaV3,
    nonceV3,
    signatureV2,
    signatureMaV2,
    nonceV2,
    authToken,
  } = input;
  if (!authToken || urls.length === 0) return false;

  // V3 first (current voice scheme), then legacy V2.
  if (nonceV3) {
    const candidates = [...splitSignatures(signatureV3), ...splitSignatures(signatureMaV3)];
    if (candidates.length > 0) {
      for (const url of urls) {
        const expected = b64hmac(authToken, v3Message(url, params, nonceV3));
        if (candidates.some((c) => safeEqual(c, expected))) return true;
      }
    }
  }
  if (nonceV2) {
    const candidates = [...splitSignatures(signatureV2), ...splitSignatures(signatureMaV2)];
    if (candidates.length > 0) {
      for (const url of urls) {
        const expected = b64hmac(authToken, v2Message(url, nonceV2));
        if (candidates.some((c) => safeEqual(c, expected))) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Answer XML
// ---------------------------------------------------------------------------

export function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mapPlivoLanguage(lang?: string): string {
  switch ((lang || "").toLowerCase().trim()) {
    case "hi":
    case "hi-in":
      return "hi-IN";
    default:
      return "en-IN";
  }
}

/** Answer XML that bridges the call into the voice runtime over WebSocket. */
export function buildInboundAnswerXml(args: {
  streamUrl: string;
  statusCallbackUrl?: string | null;
}): string {
  const callbackAttr = args.statusCallbackUrl
    ? `\n           statusCallbackUrl="${escXml(args.statusCallbackUrl)}"`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Response>\n` +
    `  <Stream bidirectional="true" keepCallAlive="true"\n` +
    `          contentType="audio/x-mulaw;rate=8000"${callbackAttr}>\n` +
    `    ${escXml(args.streamUrl)}\n` +
    `  </Stream>\n` +
    `</Response>`
  );
}

/**
 * Polite dead-end: speaks one line, then hangs up. Used when the dialed
 * number maps to no org/agent (or the agent is paused) so the caller never
 * hears dead air. No org context exists on this path, so nothing is written
 * to the DB — the runtime is never invoked either.
 */
export function buildRejectionXml(message: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Response>\n` +
    `  <Speak>${escXml(message)}</Speak>\n` +
    `  <Hangup />\n` +
    `</Response>`
  );
}

/**
 * WebSocket URL Plivo streams to. Mirrors runtime
 * `providers/telephony.py::stream_url_for_call` (https→wss, http→ws).
 */
export function plivoStreamUrl(runtimeBaseUrl: string, callId: string): string {
  const base = runtimeBaseUrl.replace(/\/+$/, "");
  const ws =
    base.startsWith("https://")
      ? `wss://${base.slice("https://".length)}`
      : base.startsWith("http://")
        ? `ws://${base.slice("http://".length)}`
        : base;
  return authorizeRuntimeStreamUrl(
    `${ws}/voice-runtime/${encodeURIComponent(callId)}`,
    callId
  );
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/** Plivo hangup-callback `CallStatus` → `calls.status` (Phase 2 check set). */
export function mapPlivoStatus(
  status: string | null | undefined
): "completed" | "busy" | "failed" | "no_answer" | "cancelled" | "ringing" | "in_progress" | null {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "failed":
      return "failed";
    case "timeout":
    case "no-answer":
    case "noanswer":
      return "no_answer";
    case "cancel":
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in_progress";
    default:
      return null;
  }
}

/** Terminal `calls.status` values — transitions out of these are ignored. */
export const TERMINAL_CALL_STATUSES = new Set([
  "completed",
  "failed",
  "busy",
  "no_answer",
  "cancelled",
  "voicemail",
]);

// ---------------------------------------------------------------------------
// Public URL reconstruction (signature covers the exact external URL)
// ---------------------------------------------------------------------------

/**
 * Candidate public URLs for signature validation. Proxies (Vercel, ngrok)
 * terminate TLS in front of us, so the externally-signed URL is rebuilt
 * from forwarding headers first, with the raw request URL as fallback.
 * A signature matching ANY candidate validates.
 */
export function publicUrlCandidates(input: {
  url: string;
  getHeader: (name: string) => string | null;
}): string[] {
  const { url, getHeader } = input;
  const out: string[] = [];
  try {
    const parsed = new URL(url);
    const proto =
      getHeader("x-forwarded-proto")?.split(",")[0]?.trim() || parsed.protocol.replace(":", "") || "https";
    const host =
      getHeader("x-forwarded-host")?.split(",")[0]?.trim() ||
      getHeader("host") ||
      parsed.host;
    if (host) {
      out.push(`${proto}://${host}${parsed.pathname}${parsed.search}`);
    }
    if (process.env.PUBLIC_WEB_URL) {
      try {
        const publicEnv = new URL(process.env.PUBLIC_WEB_URL);
        const reconstructed = `${publicEnv.protocol}//${publicEnv.host}${parsed.pathname}${parsed.search}`;
        if (!out.includes(reconstructed)) out.push(reconstructed);
      } catch {}
    }
  } catch {
    // malformed URL — fall through to the raw value below
  }
  if (url && !out.includes(url)) out.push(url);
  return out;
}

// ---------------------------------------------------------------------------
// Webhook param types (application/x-www-form-urlencoded)
// ---------------------------------------------------------------------------

export interface PlivoAnswerParams {
  From?: string;
  To?: string;
  CallUUID?: string;
  Direction?: string;
  CallStatus?: string;
  ALegUUID?: string;
  [key: string]: string | undefined;
}

export interface PlivoStatusParams extends PlivoAnswerParams {
  HangupCause?: string;
  Duration?: string;
  BillDuration?: string;
  BillRate?: string;
}

// ---------------------------------------------------------------------------
// Direct Plivo REST Client
// ---------------------------------------------------------------------------

export interface DialPlivoParams {
  authId: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
  answerUrl: string;
  hangupUrl: string;
  record?: boolean;
  recordUrl?: string;
  timeLimit?: number;
}

export interface DialPlivoResult {
  success: boolean;
  requestUuid?: string;
  message?: string;
  error?: string;
  apiId?: string;
}

/**
 * Triggers an outbound call via Plivo REST Call/ API directly.
 */
export async function dialPlivoCall(params: DialPlivoParams): Promise<DialPlivoResult> {
  const { authId, authToken, fromNumber, toNumber, answerUrl, hangupUrl } = params;
  const url = `https://api.plivo.com/v1/Account/${authId}/Call/`;
  const basicAuth = Buffer.from(`${authId}:${authToken}`).toString("base64");

  const body: Record<string, unknown> = {
    from: fromNumber,
    to: toNumber,
    answer_url: answerUrl,
    answer_method: "POST",
    hangup_url: hangupUrl,
    hangup_method: "POST",
  };

  if (params.record !== false) {
    body.record = "true";
    if (params.recordUrl) {
      body.record_url = params.recordUrl;
      body.record_url_method = "POST";
    }
  }

  if (params.timeLimit) {
    body.time_limit = params.timeLimit;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        (data as { error?: string; message?: string }).error ||
        (data as { error?: string; message?: string }).message ||
        `Plivo API HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      requestUuid: (data as { request_uuid?: string }).request_uuid,
      message: (data as { message?: string }).message,
      apiId: (data as { api_id?: string }).api_id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error contacting Plivo API",
    };
  }
}

/**
 * Validates Plivo credentials directly against the Plivo Account/ endpoint.
 */
export async function verifyPlivoCredentials(credentials: {
  authId: string;
  authToken: string;
}): Promise<{ valid: boolean; accountType?: string; error?: string }> {
  const { authId, authToken } = credentials;
  if (!authId || !authToken) {
    return { valid: false, error: "Plivo Auth ID and Auth Token are required." };
  }
  const url = `https://api.plivo.com/v1/Account/${authId}/`;
  const basicAuth = Buffer.from(`${authId}:${authToken}`).toString("base64");

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        (data as { error?: string; message?: string }).error ||
        (data as { error?: string; message?: string }).message ||
        `Authentication failed with HTTP ${res.status}`;
      return { valid: false, error: errMsg };
    }

    return {
      valid: true,
      accountType: (data as { account_type?: string }).account_type || "standard",
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Network error reaching Plivo",
    };
  }
}
