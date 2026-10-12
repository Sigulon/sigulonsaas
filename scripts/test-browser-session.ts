import assert from "node:assert/strict";
import { browserTestConfig, testSessionRequest, isRoomMissing } from "../src/lib/browser-test-session";
import type { IAgent } from "@sigulon/database";

const callId = "0123456789abcdef01234567";
assert.equal(testSessionRequest.safeParse({ action: "turn", message: "hello" }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "init", orgId: callId }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "init", voiceId: "not-a-voice" }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "init", language: "invalid" }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "init", systemPrompt: " " }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "end_call", callId, durationSeconds: 900, transcript: [] }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "end_call", callId }).success, true);
assert.equal(testSessionRequest.safeParse({ action: "end_call", callId: "bad" }).success, false);
assert.equal(testSessionRequest.safeParse({ action: "init", language: "te-IN" }).success, true);

const agent = {
  _id: { toString: () => callId }, name: "Draft", status: "draft",
  createdAt: new Date(), updatedAt: new Date(),
  config: {
    identity: { language: "en" },
    voice: { voiceId: "126a0835-beea-4e77-a883-f66eabcf6dd4", speed: 1.2 },
    instructions: { systemPrompt: "Saved prompt", greeting: "Hello" },
    tools: { enabledTools: ["pricing_lookup"] },
    settings: { recordingEnabled: false, maxCallDuration: 300, silenceTimeout: 15 },
  },
  bundle: { exported_from: { language: "en" }, sections: [] },
} as unknown as IAgent;
const config = browserTestConfig(agent, "trusted-org", "Workspace", callId, {
  systemPrompt: "Unsaved draft prompt", language: "te-IN", voiceId: "cf061d8b-a752-4865-81a2-57570a6e0565",
});
assert.equal(config.instructions.system_prompt, "Unsaved draft prompt");
assert.equal(config.bundle, null, "saved bundle must not override a draft prompt");
assert.equal(config.voice.language, "te-IN");
assert.equal(config.voice.voice_id, "cf061d8b-a752-4865-81a2-57570a6e0565");
assert.equal(config.organization_id, "trusted-org");
assert.equal(config.call_id, callId);
assert.equal(config.settings.record_calls, false);
assert.equal(config.settings.max_call_duration_seconds, 300);
assert.equal(config.settings.silence_timeout_seconds, 15);
assert.equal(config.voice.speed, 1.2);
const bundled = browserTestConfig(agent, "trusted-org", "Workspace", callId, { language: "hi-IN" });
assert.equal(bundled.bundle?.exported_from.language, "hi-IN");
assert.equal((agent.bundle?.exported_from as { language: string }).language, "en", "test must not mutate saved bundle");
const unchanged = browserTestConfig(agent, "trusted-org", "Workspace", callId, { systemPrompt: "Saved prompt" });
assert.ok(unchanged.bundle, "unchanged prompt must preserve the bundle");
assert.equal(unchanged.voice.language, unchanged.bundle.exported_from.language);
assert.equal(isRoomMissing({ code: "not_found" }), true);
assert.equal(isRoomMissing({ status: 404 }), true);
assert.equal(isRoomMissing({ status: 403 }), false);
console.log("PASS browser test request validation, draft canonical config, bundle isolation and room error handling");
