import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { validateAgentBundle, repairAgentBundle } from "../src/lib/agent-bundle/validator";
import { compileBundleToSystemPrompt } from "../src/lib/agent-bundle/compiler";
import { AgentBundle } from "../src/lib/agent-bundle/schema";
import { generateDeterministicBundle } from "../src/lib/agent-generation";

console.log("==================================================");
console.log("  RUNNING AGENT BUNDLE V2 UNIT TESTS");
console.log("==================================================");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. Example Bundles Validation
test("docs/examples/ravi-insurance-bulk.json passes validation", () => {
  const filePath = path.resolve(process.cwd(), "docs/examples/ravi-insurance-bulk.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const res = validateAgentBundle(raw);
  assert.strictEqual(res.valid, true, `Validation failed: ${res.errors.join(", ")}`);
  assert.strictEqual(res.bundle?.bundle_version, 2);
  assert.strictEqual(res.bundle?.exported_from.language, "te-IN");
});

test("docs/examples/imran-realestate-instant.json passes validation", () => {
  const filePath = path.resolve(process.cwd(), "docs/examples/imran-realestate-instant.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const res = validateAgentBundle(raw);
  assert.strictEqual(res.valid, true, `Validation failed: ${res.errors.join(", ")}`);
  assert.strictEqual(res.bundle?.bundle_version, 2);
  assert.strictEqual(res.bundle?.exported_from.language, "te-IN");
});

// 2. Deterministic Generation Validation for all supported languages
const languages = ["te-IN", "hi-IN", "en-IN", "ta-IN", "kn-IN", "ml-IN", "mr-IN"];
for (const lang of languages) {
  test(`generateDeterministicBundle produces valid bundle for ${lang}`, () => {
    const bundle = generateDeterministicBundle({
      description: "Call prospective leads about residential plots in Hyderabad and schedule a visit",
      mode: "bulk",
      language: lang,
    });
    const res = validateAgentBundle(bundle);
    assert.strictEqual(res.valid, true, `Validation failed for ${lang}: ${res.errors.join(", ")}`);
    assert.strictEqual(bundle.exported_from.language, lang);
    assert.strictEqual(bundle.sections.some((s) => s.section_key === "faqs"), true);
    assert.strictEqual(bundle.sections.find((s) => s.section_key === "faqs")?.edges, null);
    assert.strictEqual(bundle.sections.find((s) => s.section_key === "close")?.edges, null);
  });
}

// 3. Validator rejects bad edges
test("Validator rejects edge pointing to non-existent section", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "en-IN",
  });

  // Mutate an edge to point to a nonexistent node
  bundle.sections[0].edges = [
    { to_key: "does_not_exist_section", condition: "if customer responds" },
  ];

  const res = validateAgentBundle(bundle);
  assert.strictEqual(res.valid, false, "Expected validator to reject edge to non-existent section");
  assert.ok(
    res.errors.some((e) => e.includes("non-existent section") || e.includes("does_not_exist_section")),
    "Error message should mention nonexistent section"
  );
});

// 4. Validator rejects unknown {{vars}}
test("Validator rejects unknown {{vars}} in first_response and prompt", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "en-IN",
  });

  bundle.first_response = "Hello {{unregistered_variable_key}}, how can I help you today?";
  const res1 = validateAgentBundle(bundle);
  assert.strictEqual(res1.valid, false, "Expected validator to reject unregistered variable in first_response");
  assert.ok(
    res1.errors.some((e) => e.includes("unregistered_variable_key")),
    "Error should mention unregistered_variable_key"
  );

  // Fix first response, break a section prompt
  bundle.first_response = "Hello {{lead_name}}, how can I help you today?";
  bundle.sections[0].prompt = "Ask the customer about {{secret_token_unregistered}}.";
  const res2 = validateAgentBundle(bundle);
  assert.strictEqual(res2.valid, false, "Expected validator to reject unregistered variable in section prompt");
  assert.ok(
    res2.errors.some((e) => e.includes("secret_token_unregistered")),
    "Error should mention secret_token_unregistered"
  );
});

// 5. Validator rejects missing FAQs or invalid FAQs
test("Validator rejects missing faqs section", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "en-IN",
  });

  bundle.sections = bundle.sections.filter((s) => s.section_key !== "faqs");
  // Re-index orders
  bundle.sections.forEach((s, idx) => {
    s.order = idx + 1;
  });

  const res = validateAgentBundle(bundle);
  assert.strictEqual(res.valid, false, "Expected validator to reject missing faqs section");
  assert.ok(res.errors.some((e) => e.includes("faqs")), "Error should mention faqs");
});

test("Validator rejects faqs section with non-null edges", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "en-IN",
  });

  const faqs = bundle.sections.find((s) => s.section_key === "faqs");
  if (faqs) {
    faqs.edges = [{ to_key: "close", condition: "after answering" }];
  }

  const res = validateAgentBundle(bundle);
  assert.strictEqual(res.valid, false, "Expected validator to reject faqs with non-null edges");
  assert.ok(res.errors.some((e) => e.includes("faqs") && e.includes("null edges")));
});

test("Validator rejects faqs without mandatory prefix instruction", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "en-IN",
  });

  const faqs = bundle.sections.find((s) => s.section_key === "faqs");
  if (faqs) {
    faqs.prompt = "Q: What are your hours? A: 9 to 5. For example: 'We are open 9 to 5.'";
  }

  const res = validateAgentBundle(bundle);
  assert.strictEqual(res.valid, false, "Expected validator to reject faqs without required instruction");
  assert.ok(res.errors.some((e) => e.includes("Answer ONLY from what's written here")));
});

// 6. Validator enforces phone and lead_name rules
test("Validator enforces exactly one is_phone and one is_lead_name", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "en-IN",
  });

  // Remove phone flag
  bundle.variables[0].is_phone = false;
  const res1 = validateAgentBundle(bundle);
  assert.strictEqual(res1.valid, false, "Expected failure when no is_phone variable exists");

  // Restore and duplicate
  bundle.variables[0].is_phone = true;
  bundle.variables.push({
    key: "alternate_phone",
    label: "Alt Phone",
    source: "capture",
    required: false,
    is_phone: true,
    is_lead_name: false,
    is_headline: false,
    value_type: "text",
    choices: null,
    extract_hint: null,
  });
  const res2 = validateAgentBundle(bundle);
  assert.strictEqual(res2.valid, false, "Expected failure when multiple is_phone variables exist");
});

// 7. Compiler produces valid system prompt
test("compileBundleToSystemPrompt includes all sections and instructions", () => {
  const bundle = generateDeterministicBundle({
    description: "General customer enquiry",
    mode: "bulk",
    language: "te-IN",
  });

  const prompt = compileBundleToSystemPrompt(bundle);
  assert.ok(prompt.includes("AGENT RUNTIME SPECIFICATION (Bundle v2)"));
  assert.ok(prompt.includes("## Opening utterance"));
  assert.ok(prompt.includes(bundle.first_response));
  assert.ok(prompt.includes("One Question Rule"));
  assert.ok(prompt.includes("[greeting_purpose]"));
  assert.ok(prompt.includes("[faqs]"));
  assert.ok(prompt.includes("[close]"));
});

// 8. Round-trip serialization fidelity
test("Bundle round-trip JSON serialization retains identical content", () => {
  const original = generateDeterministicBundle({
    description: "Customer follow up for auto insurance",
    mode: "instant",
    language: "te-IN",
  });

  const jsonString = JSON.stringify(original);
  const parsed = JSON.parse(jsonString) as AgentBundle;
  const validation = validateAgentBundle(parsed);
  assert.strictEqual(validation.valid, true);
  assert.deepStrictEqual(parsed, original);
});

// 9. API rejection contract: invalid bundle returns field-level errors
test("API bundle validation rejects invalid bundles with field-level error messages", () => {
  const invalidBundle = {
    bundle_version: 2,
    exported_from: {
      employee_name: "Test",
      employee_role: "Agent",
      mode: "bulk",
      language: "te-IN",
    },
    first_response: "Hello {{unknown_variable}}", // Unknown variable
    sections: [
      {
        section_key: "start",
        label: "Start",
        order: 1,
        enabled: true,
        node_type: "llm",
        edges: [{ to_key: "non_existent_key", condition: "always" }], // Invalid edge
        prompt: "Say hello",
      },
      // Missing faqs and close
    ],
    variables: [], // Missing phone and lead_name
  };

  const validation = validateAgentBundle(invalidBundle);
  assert.strictEqual(validation.valid, false, "Should be invalid");
  assert.ok(validation.errors.length >= 3, "Should report multiple field-level errors");
  assert.ok(validation.errors.some((e) => e.includes("phone")), "Should flag missing phone variable");
  assert.ok(validation.errors.some((e) => e.includes("faqs")), "Should flag missing faqs section");
  assert.ok(validation.errors.some((e) => e.includes("non_existent_key")), "Should flag invalid edge target");
  assert.ok(validation.errors.some((e) => e.includes("unknown_variable")), "Should flag undeclared variable");
});

console.log("--------------------------------------------------");
console.log(`Tests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED!");
  process.exit(0);
}
