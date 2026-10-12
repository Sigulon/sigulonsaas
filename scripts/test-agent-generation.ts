import assert from "node:assert/strict";
import { generateAgentWithLlm, generateDeterministicBundle } from "../src/lib/agent-generation";
import { generateLiveKitChatCompletion } from "../src/lib/livekit";

const originalFetch = globalThis.fetch;
const originalKey = process.env.LIVEKIT_API_KEY;
const originalSecret = process.env.LIVEKIT_API_SECRET;
const params = { description: "Customer support for a local business", language: "en-IN" };
const bundle = generateDeterministicBundle(params);
bundle.sections[0].prompt = "Preserve [brackets], snake_case and {{lead_name}}.\nTwo  spaces.";
const raw = JSON.stringify(bundle);
let calls = 0;
let replies: string[] = [];
const requests: Record<string, unknown>[] = [];
function mock(contents: string[]) {
  calls = 0;
  replies = contents;
  requests.length = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.ok(init?.signal, "fetch must have a bounded timeout signal");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: replies.shift() } }], model: "google/gemini-2.5-flash", usage: { prompt_tokens: 10, completion_tokens: 20 } });
  };
}
try {
  process.env.LIVEKIT_API_KEY = "offline-test";
  process.env.LIVEKIT_API_SECRET = "offline-test";
  mock([raw]);
  const progress: string[] = [];
  const result = await generateAgentWithLlm({ ...params, onProgress: (step) => { progress.push(step); } });
  assert.deepEqual(result.bundle, bundle);
  assert.deepEqual(result.tokenUsage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  assert.deepEqual(progress, ["understanding", "designing", "writing", "validating"]);
  const messages = requests[0].messages as { content: string }[];
  assert.ok(!messages[0].content.includes("CRITICAL CONVERSATIONAL RULES"));
  assert.ok(messages[0].content.includes("Never copy their business facts"));
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
  console.log("PASS structured JSON preserves keys, arrays, placeholders, whitespace and prompt constraints");

  mock(["```json\n{}\n```", raw]);
  const retried = await generateAgentWithLlm(params);
  assert.equal(retried.retryCount, 1);
  assert.equal(calls, 2);
  assert.deepEqual(retried.tokenUsage, { promptTokens: 20, completionTokens: 40, totalTokens: 60 });
  console.log("PASS strict parsing retries and aggregates usage");

  mock(["{}", "{}"]);
  await assert.rejects(generateAgentWithLlm(params), /invalid bundle/);
  assert.equal(calls, 2);
  console.log("PASS invalid schema fails explicitly without fabricated fallback");

  globalThis.fetch = async () => { throw new Error("network down"); };
  await assert.rejects(generateAgentWithLlm(params), /LiveKit Inference is unavailable/);
  console.log("PASS network failure is explicit");

  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: raw } }] });
  const missing = await generateAgentWithLlm(params);
  assert.deepEqual(missing.tokenUsage, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  assert.equal(missing.model, "google/gemini-2.5-flash");
  assert.equal(await generateLiveKitChatCompletion({ messages: [], structuredOutput: true }), raw);
  console.log("PASS omitted usage defaults and structured mode independent of includeUsage");

  delete process.env.LIVEKIT_API_KEY;
  await assert.rejects(generateAgentWithLlm(params), /LiveKit Inference is unavailable/);
  console.log("PASS missing credentials fail explicitly");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.LIVEKIT_API_KEY;
  else process.env.LIVEKIT_API_KEY = originalKey;
  if (originalSecret === undefined) delete process.env.LIVEKIT_API_SECRET;
  else process.env.LIVEKIT_API_SECRET = originalSecret;
}
