import { describe, it, expect } from "vitest";
import { validateAgentBundle, repairAgentBundle } from "@sigulon/agent-schema/validation";
import {
  generateAgentBundle,
  buildDeterministicFallbackBundle,
  compileBundleToSystemPrompt,
} from "../agent-bundle-generator";
import { AgentSpecification } from "@sigulon/agent-schema/schema";

describe("Agent Bundle Schema & Generator", () => {
  const sampleSpec: AgentSpecification = {
    call_type: "outbound",
    agent: {
      name: "Priya",
      role: "Property Consultant",
    },
    call_purpose: "Qualify interest in 3BHK luxury villas in Jubilee Hills",
    desired_outcomes: ["Schedule an on-site visit for the weekend"],
    qualification_fields: [
      {
        key: "villa_bhk",
        label: "Configuration preference",
        type: "choice",
        choices: ["3 BHK", "4 BHK"],
        required: true,
        description: "Are you looking for a 3 BHK or 4 BHK villa?",
      },
      {
        key: "budget_range",
        label: "Budget range",
        type: "text",
        required: true,
        description: "What budget range are you targeting for this property?",
      },
    ],
    pre_call_variables: [
      {
        key: "lead_name",
        label: "Customer Full Name",
        source: "pre",
        value_type: "text",
      },
    ],
    business_knowledge: "Greenfield Villas is a gated community of 45 luxury homes starting from 3.5 Crores with club house.",
    faqs: [
      {
        question: "When is possession?",
        answer: "Possession starts in December 2026.",
      },
    ],
    actions: [
      { action: "Schedule site visit" },
      { action: "Send WhatsApp brochure" },
    ],
    language: "en",
    auto_language_switch: true,
    personality: ["Warm", "Professional"],
    conversation_style: "balanced",
    rules: [
      "Do not offer unauthorized discounts.",
      "Never insist if customer is busy.",
    ],
  };

  it("builds a valid deterministic bundle from specification", () => {
    const bundle = buildDeterministicFallbackBundle(sampleSpec);

    expect(bundle.bundle_version).toBe(2);
    expect(bundle.exported_from.employee_name).toBe("Priya");
    expect(bundle.exported_from.mode).toBe("outbound");
    expect(bundle.variables).toHaveLength(4); // required phone + 1 pre + 2 capture
    expect(bundle.variables.find((variable) => variable.key === "phone")).toMatchObject({
      source: "pre",
      required: true,
      is_phone: true,
    });
    expect(bundle.sections.length).toBeGreaterThanOrEqual(4);

    const validation = validateAgentBundle(bundle);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("validates that each capture variable has its own dedicated qualification section", () => {
    const bundle = buildDeterministicFallbackBundle(sampleSpec);

    // Voice rule: One question at a time
    const qualSections = bundle.sections.filter((s) => s.section_key.startsWith("qualify_"));
    expect(qualSections).toHaveLength(2);
    expect(qualSections[0].prompt).toContain("Ask ONLY this single question");
  });

  it("repairs markdown code blocks in LLM JSON output", () => {
    const rawMarkdownJson = `\`\`\`json
{
  "bundle_version": 2,
  "exported_from": {
    "employee_name": "Kiran",
    "employee_role": "Support Specialist",
    "mode": "inbound",
    "language": "en"
  },
  "first_response": "Hello! How can I assist you today?",
  "sections": [
    {
      "section_key": "context_orient",
      "label": "Greeting",
      "order": 1,
      "enabled": true,
      "node_type": "llm",
      "edges": [{ "to_key": "close", "condition": "user done" }],
      "prompt": "Say hello."
    },
    {
      "section_key": "close",
      "label": "Close",
      "order": 2,
      "enabled": true,
      "node_type": "llm",
      "edges": null,
      "prompt": "Say bye."
    }
  ],
  "variables": []
}
\`\`\``;

    const repaired = repairAgentBundle(rawMarkdownJson);
    const validation = validateAgentBundle(repaired);
    expect(validation.valid).toBe(true);
    expect(validation.bundle?.exported_from.employee_name).toBe("Kiran");
  });

  it("compiles bundle to system prompt string", () => {
    const bundle = buildDeterministicFallbackBundle(sampleSpec);
    const systemPrompt = compileBundleToSystemPrompt(bundle);

    expect(systemPrompt).toContain("# AGENT RUNTIME SPECIFICATION (Bundle v2)");
    expect(systemPrompt).toContain("Priya");
    expect(systemPrompt).toContain("qualify_villa_bhk");
    expect(systemPrompt).toContain("One Question Rule");
  });

  it("generateAgentBundle falls back safely without error when API is offline", async () => {
    const result = await generateAgentBundle(sampleSpec);
    expect(result.bundle).toBeDefined();
    expect(result.bundle.bundle_version).toBe(2);
    expect(result.bundle.sections.length).toBeGreaterThan(0);
  });

  it("builds a multilingual bulk bundle from a natural-language request", () => {
    const bundle = buildDeterministicFallbackBundle({
      mode: "bulk",
      language: "te-IN",
      languages: ["te-IN", "en-IN"],
      business_description: "We are a real estate business in Hyderabad.",
      agent_goal: "Call new property leads, understand budget and location, and capture a site visit request.",
      data_to_collect: ["Budget", "Preferred location"],
      business_knowledge: "We have verified project details available from the team.",
    });

    expect(bundle.exported_from.mode).toBe("bulk");
    expect(bundle.exported_from.language).toBe("te-IN");
    expect(bundle.exported_from.languages).toEqual(["te-IN", "en-IN"]);
    expect(bundle.first_response).toContain("{{lead_name}}");
    expect(bundle.first_response).toMatch(/[\u0C00-\u0C7F]/);
    expect(bundle.sections.some((section) => section.section_key === "faqs")).toBe(true);
    expect(validateAgentBundle(bundle).valid).toBe(true);
  });
});
