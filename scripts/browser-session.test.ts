import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), org: vi.fn(), agent: vi.fn(), createCall: vi.fn(), findCall: vi.fn(), updateCall: vi.fn(),
  event: vi.fn(), transition: vi.fn(), prewarm: vi.fn(), redisDelete: vi.fn(),
  createRoom: vi.fn(), deleteRoom: vi.fn(), dispatch: vi.fn(), token: vi.fn(), grant: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.user }));
vi.mock("@/lib/auth-helpers", () => ({ getOrgContext: mocks.org }));
vi.mock("@sigulon/database", () => ({
  AgentRepository: { findById: mocks.agent },
  CallRepository: { create: mocks.createCall, addEvent: mocks.event, transitionState: mocks.transition },
  CallModel: { findOne: mocks.findCall, updateOne: mocks.updateCall },
}));
vi.mock("@/lib/redis", () => ({ prewarmCallConfig: mocks.prewarm, getRedisClient: async () => ({ del: mocks.redisDelete }) }));
vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: class { createRoom = mocks.createRoom; deleteRoom = mocks.deleteRoom; },
  AgentDispatchClient: class { createDispatch = mocks.dispatch; },
  AccessToken: class { addGrant = mocks.grant; toJwt = mocks.token; },
}));
import { POST } from "../src/app/api/agents/[id]/test-session/route";

const id = "0123456789abcdef01234567";
const callId = "abcdef0123456789abcdef01";
const orgId = "trusted-org";
const userId = "trusted-user";
const agent = {
  _id: id, name: "Draft", status: "draft", createdAt: new Date(), updatedAt: new Date(),
  config: {
    identity: { language: "en" }, voice: { voiceId: "126a0835-beea-4e77-a883-f66eabcf6dd4" },
    instructions: { systemPrompt: "Saved", greeting: "Hello" }, tools: { enabledTools: [] }, settings: {},
  },
  bundle: {
    bundle_version: 2,
    exported_from: { employee_name: "Draft", employee_role: "Support", mode: "inbound", language: "en-IN" },
    first_response: "Hello from the bundle",
    sections: [{ section_key: "faqs", label: "FAQs", order: 1, enabled: true, node_type: "llm", edges: null,
      prompt: "Answer ONLY from what's written here; if a question isn't listed, use your don't-know response." }],
    variables: [
      { key: "phone", label: "Phone", source: "pre", required: true, is_phone: true },
      { key: "lead_name", label: "Name", source: "pre", required: false, is_lead_name: true },
    ],
  },
};
async function request(body: unknown) {
  return POST(new NextRequest(`http://localhost/api/agents/${id}/test-session`, {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  }), { params: Promise.resolve({ id }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.LIVEKIT_URL = "wss://unit-test.invalid";
  process.env.LIVEKIT_API_KEY = "test-only";
  process.env.LIVEKIT_API_SECRET = "test-only";
  mocks.user.mockResolvedValue({ _id: userId });
  mocks.org.mockResolvedValue({ orgId, userId, role: "member" });
  mocks.agent.mockResolvedValue(agent);
  mocks.createCall.mockResolvedValue({ _id: callId });
  mocks.prewarm.mockResolvedValue(true);
  mocks.token.mockResolvedValue("signed-test-token");
  mocks.deleteRoom.mockResolvedValue(undefined);
  mocks.findCall.mockReturnValue({ exec: async () => ({ _id: callId, providerCallId: `sigulon-test-${callId}` }) });
});

test("rejects anonymous callers before the development org fallback", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await request({ action: "init" })).status).toBe(401);
  expect(mocks.org).not.toHaveBeenCalled();
  expect(mocks.createCall).not.toHaveBeenCalled();
});
test("rejects viewer roles", async () => {
  mocks.org.mockResolvedValue({ orgId, userId, role: "viewer" });
  expect((await request({ action: "init" })).status).toBe(403);
});
test("rejects tenant metadata and browser-authoritative results", async () => {
  expect((await request({ action: "init", orgId: "other-org" })).status).toBe(400);
  expect((await request({ action: "end_call", callId, durationSeconds: 100, transcript: [] })).status).toBe(400);
  expect(mocks.createCall).not.toHaveBeenCalled();
  expect(mocks.deleteRoom).not.toHaveBeenCalled();
});
test("missing agent cannot create a call", async () => {
  mocks.agent.mockResolvedValue(null);
  expect((await request({ action: "init" })).status).toBe(404);
  expect(mocks.agent).toHaveBeenCalledWith(id, orgId);
  expect(mocks.createCall).not.toHaveBeenCalled();
});
test("prewarms draft overrides before creating a room and dispatching", async () => {
  const response = await request({ action: "init", systemPrompt: "Draft override", language: "te-IN" });
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({ callId, livekitToken: "signed-test-token", roomName: `sigulon-test-${callId}` });
  expect(data).not.toHaveProperty("replyText");
  expect(mocks.prewarm).toHaveBeenCalledWith(callId, expect.objectContaining({
    call_id: callId, organization_id: orgId, bundle: null,
    instructions: expect.objectContaining({ system_prompt: "Draft override" }),
    voice: expect.objectContaining({ language: "te-IN" }),
  }));
  expect(mocks.prewarm.mock.invocationCallOrder[0]).toBeLessThan(mocks.createRoom.mock.invocationCallOrder[0]);
  expect(mocks.createRoom.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
  const metadata = JSON.parse(mocks.dispatch.mock.calls[0][2].metadata);
  expect(metadata).toMatchObject({ orgId, agentId: id, callId });
  expect(metadata).not.toHaveProperty("systemPrompt");
});
test("cache failure fails closed and marks the call failed", async () => {
  mocks.prewarm.mockResolvedValue(false);
  expect((await request({ action: "init" })).status).toBe(503);
  expect(mocks.createRoom).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(mocks.transition).toHaveBeenCalledWith(callId, "FAILED", expect.any(Object));
});
test("unchanged caller prompt preserves the saved bundle", async () => {
  expect((await request({ action: "init", systemPrompt: "Saved" })).status).toBe(200);
  expect(mocks.prewarm.mock.calls[0][1]).toMatchObject({
    bundle: { first_response: "Hello from the bundle" },
    voice: { language: "en-IN" },
  });
});
test("validates and prewarms the unsaved editor bundle including its greeting and graph", async () => {
  const bundle = { ...agent.bundle, first_response: "Unsaved greeting" };
  expect((await request({ action: "init", bundle, systemPrompt: "Different draft", language: "en-US" })).status).toBe(200);
  expect(mocks.prewarm.mock.calls[0][1]).toMatchObject({
    instructions: { introduction: "Unsaved greeting" },
    voice: { language: "en-US" },
    bundle: { first_response: "Unsaved greeting", exported_from: { language: "en-US", languages: ["en-US"] }, sections: bundle.sections },
  });
});
test("invalid editor bundle fails before creating a call", async () => {
  expect((await request({ action: "init", bundle: { ...agent.bundle, sections: [] } })).status).toBe(400);
  expect(mocks.createCall).not.toHaveBeenCalled();
});
test("dispatch failure removes room/cache and returns no usable token", async () => {
  mocks.dispatch.mockRejectedValue(new Error("worker unavailable"));
  const response = await request({ action: "init" });
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("livekitToken");
  expect(mocks.deleteRoom).toHaveBeenCalledWith(`sigulon-test-${callId}`);
  expect(mocks.redisDelete).toHaveBeenCalledWith(`sigulon:call:${callId}:config`);
});
test("end-call lookup scopes tenant, agent, owner and web-test provider", async () => {
  expect((await request({ action: "end_call", callId })).status).toBe(200);
  expect(mocks.findCall).toHaveBeenCalledWith({ _id: callId, organizationId: orgId, agentId: id,
    provider: "livekit-web", "metadata.is_web_test": true, "metadata.test_user_id": userId });
  expect(mocks.deleteRoom).toHaveBeenCalledWith(`sigulon-test-${callId}`);
  expect(mocks.transition).not.toHaveBeenCalled();
});
test("end-call cannot delete an unowned call room", async () => {
  mocks.findCall.mockReturnValue({ exec: async () => null });
  expect((await request({ action: "end_call", callId })).status).toBe(404);
  expect(mocks.deleteRoom).not.toHaveBeenCalled();
});
test("already-deleted room is idempotent but other delete errors fail", async () => {
  mocks.deleteRoom.mockRejectedValue({ code: "not_found" });
  expect((await request({ action: "end_call", callId })).status).toBe(200);
  mocks.deleteRoom.mockRejectedValue({ code: "permission_denied" });
  expect((await request({ action: "end_call", callId })).status).toBe(500);
});
