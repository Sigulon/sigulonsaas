import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), cookies: vi.fn(), member: vi.fn(), memberships: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: mocks.user, ACTIVE_ORG_COOKIE_NAME: "sigulon_active_org_id",
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@sigulon/database", () => ({
  OrganizationRepository: { getMember: mocks.member, findUserMemberships: mocks.memberships },
}));
import { POST } from "../src/app/api/agents/transcribe/route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/agents/transcribe", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", ...headers },
    body: "unparsed audio upload",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ _id: "user-1", status: "active" });
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  mocks.memberships.mockResolvedValue([{ organization: { _id: "org-1" } }]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Provider calls are forbidden"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("upload transcription fail-closed policy", () => {
  it("requires a real session rather than the development fallback", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("rejects inactive users", async () => {
    mocks.user.mockResolvedValue({ _id: "user-1", status: "suspended" });
    expect((await POST(request())).status).toBe(401);
  });

  it("requires organization membership", async () => {
    mocks.memberships.mockResolvedValue([]);
    expect((await POST(request())).status).toBe(403);
  });

  it("rejects another organization's cookie without falling back", async () => {
    const org = "a".repeat(24);
    mocks.cookies.mockResolvedValue({ get: () => ({ value: org }) });
    mocks.member.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.member).toHaveBeenCalledWith(org, "user-1");
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("rejects malformed organization ids before querying", async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "invalid" }) });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.member).not.toHaveBeenCalled();
  });

  it("returns an actionable unsupported response with the transcript field", async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "a".repeat(24) }) });
    mocks.member.mockResolvedValue({ role: "member" });
    const req = request();
    const bodyParser = vi.spyOn(req, "formData");
    const response = await POST(req);
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      success: false, transcript: "", code: "LIVEKIT_UPLOAD_STT_UNSUPPORTED",
      error: expect.stringContaining("live browser call"),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(bodyParser).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ "content-length": String(8 * 1024 * 1024 + 1) }, 413],
    [{ "content-length": "-1" }, 400],
    [{ "content-type": "application/json" }, 415],
    [{ "content-type": "audio/webm" }, 415],
  ])("rejects invalid headers without reading audio: %j", async (headers, status) => {
    const req = request(headers);
    expect((await POST(req)).status).toBe(status);
    expect(req.bodyUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unknown-length uploads before parsing any type or duration", async () => {
    const req = request({ "transfer-encoding": "chunked" });
    expect((await POST(req)).status).toBe(501);
    expect(req.bodyUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose internal exception details", async () => {
    mocks.memberships.mockRejectedValue(new Error("secret provider payload"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret provider payload");
  });

  it("bounds authorization waiting to five seconds", async () => {
    vi.useFakeTimers();
    mocks.user.mockReturnValue(new Promise(() => {}));
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
