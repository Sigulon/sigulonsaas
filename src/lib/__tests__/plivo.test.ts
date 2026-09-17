import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildInboundAnswerXml,
  buildRejectionXml,
  mapPlivoStatus,
  plivoStreamUrl,
  publicUrlCandidates,
  v2Message,
  v3Message,
  verifyPlivoSignature,
  dialPlivoCall,
  verifyPlivoCredentials,
  mapPlivoLanguage,
  escXml,
  type PlivoSignatureInput,
} from "../plivo";
import { vi } from "vitest";
import {
  createRuntimeStreamToken,
  verifyRuntimeStreamToken,
} from "../runtime-stream-auth";

const TOKEN = "test-auth-token";
const URL = "https://example.com/api/webhooks/plivo/inbound";

// Params from Plivo's own V3 doc example (out of order on purpose — the
// validator must sort before hashing).
const PARAMS = {
  To: "+15555555555",
  From: "+15551111111",
  Digits: "1234",
  Caller: "+15551111111",
  CallUuid: "4vbcpem8-0u46-x1ha-9af1-438vc92bf374",
};
const NONCE = "kjsdhfsd87sd7yisud2";

function b64(token: string, msg: string): string {
  return createHmac("sha256", token).update(msg, "utf8").digest("base64");
}

function baseInput(overrides: Partial<PlivoSignatureInput> = {}): PlivoSignatureInput {
  return {
    urls: [URL],
    params: PARAMS,
    signatureV3: b64(TOKEN, v3Message(URL, PARAMS, NONCE)),
    signatureMaV3: null,
    nonceV3: NONCE,
    signatureV2: null,
    signatureMaV2: null,
    nonceV2: null,
    authToken: TOKEN,
    ...overrides,
  };
}

describe("v3Message", () => {
  it("matches Plivo's documented assembly (url.sorted-kv.nonce)", () => {
    expect(v3Message(URL, PARAMS, NONCE)).toBe(
      `${URL}.CallUuid4vbcpem8-0u46-x1ha-9af1-438vc92bf374Caller+15551111111Digits1234From+15551111111To+15555555555.${NONCE}`
    );
  });

  it("omits the params segment for GET-style validation", () => {
    expect(v3Message(URL, {}, NONCE)).toBe(`${URL}.${NONCE}`);
  });

  it("sorts keys regardless of input order", () => {
    const a = v3Message(URL, { b: "2", a: "1" }, NONCE);
    const b = v3Message(URL, { a: "1", b: "2" }, NONCE);
    expect(a).toBe(b);
  });
});

describe("verifyPlivoSignature", () => {
  it("accepts a valid V3 signature", () => {
    expect(verifyPlivoSignature(baseInput())).toBe(true);
  });

  it("rejects tampered params and wrong tokens", () => {
    expect(
      verifyPlivoSignature(
        baseInput({ params: { ...PARAMS, To: "+10000000000" } })
      )
    ).toBe(false);
    expect(verifyPlivoSignature(baseInput({ authToken: "wrong" }))).toBe(false);
    expect(
      verifyPlivoSignature(baseInput({ signatureV3: "bogus", nonceV3: NONCE }))
    ).toBe(false);
  });

  it("accepts any entry of a comma-separated rotation header", () => {
    const valid = b64(TOKEN, v3Message(URL, PARAMS, NONCE));
    expect(
      verifyPlivoSignature(baseInput({ signatureV3: `stale-sig,${valid}` }))
    ).toBe(true);
  });

  it("accepts the main-account (Ma) header", () => {
    const valid = b64(TOKEN, v3Message(URL, PARAMS, NONCE));
    expect(
      verifyPlivoSignature(
        baseInput({ signatureV3: null, signatureMaV3: valid })
      )
    ).toBe(true);
  });

  it("accepts any matching URL candidate (forwarded vs raw)", () => {
    const forwarded = "https://public.example.com/api/webhooks/plivo/inbound";
    const sig = b64(TOKEN, v3Message(forwarded, PARAMS, NONCE));
    expect(
      verifyPlivoSignature(
        baseInput({ urls: [forwarded, URL], signatureV3: sig })
      )
    ).toBe(true);
  });

  it("falls back to legacy V2 (url+nonce, no separator)", () => {
    const nonce2 = "05429567804466091622";
    expect(v2Message(URL, nonce2)).toBe(`${URL}${nonce2}`);
    expect(
      verifyPlivoSignature(
        baseInput({
          signatureV3: null,
          nonceV3: null,
          signatureV2: b64(TOKEN, v2Message(URL, nonce2)),
          nonceV2: nonce2,
        })
      )
    ).toBe(true);
  });

  it("fails closed on missing token or urls", () => {
    expect(verifyPlivoSignature(baseInput({ authToken: "" }))).toBe(false);
    expect(verifyPlivoSignature(baseInput({ urls: [] }))).toBe(false);
  });
});

describe("publicUrlCandidates", () => {
  it("prefers forwarded proto/host, keeps raw as fallback", () => {
    const out = publicUrlCandidates({
      url: "http://internal:3000/api/webhooks/plivo/inbound?x=1",
      getHeader: (n) =>
        n === "x-forwarded-proto"
          ? "https"
          : n === "x-forwarded-host"
            ? "public.example.com"
            : null,
    });
    expect(out[0]).toBe(
      "https://public.example.com/api/webhooks/plivo/inbound?x=1"
    );
    expect(out).toContain("http://internal:3000/api/webhooks/plivo/inbound?x=1");
  });
});

describe("answer XML", () => {
  it("bridges into the runtime stream URL", () => {
    const xml = buildInboundAnswerXml({
      streamUrl: "wss://rt.example.com/voice-runtime/abc-123",
      statusCallbackUrl: "https://rt.example.com/plivo/status-callback",
    });
    expect(xml).toContain("<Stream");
    expect(xml).toContain('bidirectional="true"');
    expect(xml).toContain("wss://rt.example.com/voice-runtime/abc-123");
    expect(xml).toContain("statusCallbackUrl=");
  });

  it("escapes XML metacharacters", () => {
    const xml = buildRejectionXml('Busy & "unavailable" <now>');
    expect(xml).toContain("<Speak>");
    expect(xml).toContain("<Hangup />");
    expect(xml).not.toContain('"unavailable"');
    expect(xml).toContain("&amp;");
  });
});

describe("plivoStreamUrl", () => {
  it("converts https→wss and http→ws, trims slashes, encodes ids", () => {
    const oldSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = "test-stream-signing-secret";
    expect(plivoStreamUrl("https://rt.example.com/", "abc")).toMatch(
      /^wss:\/\/rt\.example\.com\/voice-runtime\/abc\?token=/
    );
    expect(plivoStreamUrl("http://localhost:8000", "a/b")).toMatch(
      /^ws:\/\/localhost:8000\/voice-runtime\/a%2Fb\?token=/
    );
    if (oldSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = oldSecret;
  });
});

describe("runtime stream authorization", () => {
  it("accepts the matching unexpired call token and rejects a different call", () => {
    const oldSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = "test-stream-signing-secret";
    const now = Date.UTC(2026, 0, 1);
    const token = createRuntimeStreamToken("call-a", now);
    expect(verifyRuntimeStreamToken("call-a", token, now)).toBe(true);
    expect(verifyRuntimeStreamToken("call-b", token, now)).toBe(false);
    if (oldSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = oldSecret;
  });
});

describe("mapPlivoStatus", () => {
  it("maps hangup statuses onto the calls check set", () => {
    expect(mapPlivoStatus("completed")).toBe("completed");
    expect(mapPlivoStatus("busy")).toBe("busy");
    expect(mapPlivoStatus("failed")).toBe("failed");
    expect(mapPlivoStatus("timeout")).toBe("no_answer");
    expect(mapPlivoStatus("no-answer")).toBe("no_answer");
    expect(mapPlivoStatus("cancel")).toBe("cancelled");
    expect(mapPlivoStatus("ringing")).toBe("ringing");
    expect(mapPlivoStatus("in-progress")).toBe("in_progress");
    expect(mapPlivoStatus("weird")).toBeNull();
    expect(mapPlivoStatus(null)).toBeNull();
  });
});

describe("dialPlivoCall", () => {
  it("returns requestUuid on successful REST dial", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: "call fired",
        request_uuid: "test-plivo-uuid-123",
        api_id: "api-test-456",
      }),
    });

    const result = await dialPlivoCall({
      authId: "MA12345",
      authToken: "secret",
      fromNumber: "+15551234567",
      toNumber: "+919876543210",
      answerUrl: "https://example.com/answer",
      hangupUrl: "https://example.com/hangup",
    });

    expect(result.success).toBe(true);
    expect(result.requestUuid).toBe("test-plivo-uuid-123");
    global.fetch = originalFetch;
  });

  it("handles Plivo API errors gracefully", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "Mandatory parameter missing: to",
      }),
    });

    const result = await dialPlivoCall({
      authId: "MA12345",
      authToken: "secret",
      fromNumber: "+15551234567",
      toNumber: "",
      answerUrl: "https://example.com/answer",
      hangupUrl: "https://example.com/hangup",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Mandatory parameter missing");
    global.fetch = originalFetch;
  });
});

describe("verifyPlivoCredentials", () => {
  it("verifies valid credentials", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        account_type: "standard",
      }),
    });

    const result = await verifyPlivoCredentials({
      authId: "MA12345",
      authToken: "secret",
    });

    expect(result.valid).toBe(true);
    expect(result.accountType).toBe("standard");
    global.fetch = originalFetch;
  });

  it("detects invalid credentials", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: "Authentication failed",
      }),
    });

    const result = await verifyPlivoCredentials({
      authId: "MA12345",
      authToken: "wrong",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Authentication failed");
    global.fetch = originalFetch;
  });
});

describe("mapPlivoLanguage", () => {
  it("maps Hindi language codes to hi-IN", () => {
    expect(mapPlivoLanguage("hi")).toBe("hi-IN");
    expect(mapPlivoLanguage("hi-IN")).toBe("hi-IN");
    expect(mapPlivoLanguage("HI")).toBe("hi-IN");
  });

  it("maps English and unsupported regional languages to en-IN for Polly/Plivo compatibility", () => {
    expect(mapPlivoLanguage("en")).toBe("en-IN");
    expect(mapPlivoLanguage("en-US")).toBe("en-IN");
    expect(mapPlivoLanguage("te")).toBe("en-IN");
    expect(mapPlivoLanguage(undefined)).toBe("en-IN");
  });
});

describe("escXml", () => {
  it("escapes all special XML characters", () => {
    expect(escXml('<hello & "world">')).toBe("&lt;hello &amp; &quot;world&quot;&gt;");
  });
});
