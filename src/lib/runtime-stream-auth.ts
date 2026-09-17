/**
 * Short-lived, HMAC-signed authorization for the public Plivo media socket.
 *
 * Plivo WebSocket media streams do not carry the usual webhook signature.
 * A call ID alone must therefore never authorize a connection to a live
 * agent. The control plane and runtime share INTERNAL_API_SECRET and use this
 * compact token only for the initial WebSocket handshake.
 */
import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_SECONDS = 10 * 60;

function streamSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET?.trim() || "";
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is required to authorize Plivo media streams.");
  }
  return secret;
}

function signature(callId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}.${callId}.${expiresAt}`, "utf8")
    .digest("base64url");
}

/** Create a token safe to put in a Plivo <Stream> URL. */
export function createRuntimeStreamToken(callId: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  return `${TOKEN_VERSION}.${expiresAt}.${signature(callId, expiresAt, streamSecret())}`;
}

/** Append a signed token without exposing the shared secret itself. */
export function authorizeRuntimeStreamUrl(url: string, callId: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(createRuntimeStreamToken(callId))}`;
}

/** Exported only for deterministic unit tests. */
export function verifyRuntimeStreamToken(
  callId: string,
  token: string | null | undefined,
  now = Date.now()
): boolean {
  if (!token) return false;
  const [version, expiresRaw, received] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (
    version !== TOKEN_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Math.floor(now / 1000) ||
    !received
  ) {
    return false;
  }
  let expected: string;
  try {
    expected = signature(callId, expiresAt, streamSecret());
  } catch {
    return false;
  }
  const actualBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
