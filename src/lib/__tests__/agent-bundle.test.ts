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

import raviInsuranceExample from "../../../docs/examples/ravi-insurance-bulk.json";
import imranRealEstateExample from "../../../docs/examples/imran-realestate-instant.json";
import {
  validateAgentBundle as validateAgentBundleV2,
  analyzeBundleVariables,
  repairAgentBundle as repairAgentBundleV2,
  AgentBundle,
} from "../agent-bundle";
import { generateDeterministicBundle } from "../agent-generation";

describe("Agent Bundle v2 Source of Truth Validator", () => {
  it("validates the official Ravi insurance bulk example bundle", () => {
    const result = validateAgentBundleV2(raviInsuranceExample);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.bundle?.bundle_version).toBe(2);
    expect(result.bundle?.exported_from.language).toBe("te-IN");
  });

  it("validates the official Imran real estate instant qualifier example bundle", () => {
    const result = validateAgentBundleV2(imranRealEstateExample);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.bundle?.bundle_version).toBe(2);
    expect(result.bundle?.exported_from.mode).toBe("instant");
  });

  it("fails when an edge points to a non-existent section_key", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    invalidBundle.sections[0].edges[0].to_key = "non_existent_section";

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("non_existent_section"))).toBe(true);
  });

  it("fails when a section has an empty edges array instead of null", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    // Terminal sections must have edges: null, not []
    invalidBundle.sections[5].edges = [];

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("empty edges array"))).toBe(true);
  });

  it("fails when an orphan section cannot be reached from the entry section", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    // Break the link to qualify_vehicle and confirm_quote_dispatch
    invalidBundle.sections[0].edges = [
      { to_key: "close", condition: "if lead hangs up" },
    ];

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("Unreachable section"))).toBe(true);
  });

  it("fails when the mandatory 'faqs' section is missing", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    invalidBundle.sections = invalidBundle.sections.filter(
      (s: any) => s.section_key !== "faqs"
    );
    // Rewire edge that pointed to faqs
    invalidBundle.sections.forEach((s: any) => {
      if (Array.isArray(s.edges)) {
        s.edges = s.edges.filter((e: any) => e.to_key !== "faqs");
      }
      if (s.edges && s.edges.length === 0) s.edges = null;
    });

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("faqs"))).toBe(true);
  });

  it("fails when the 'faqs' section is missing the required strict instruction prompt", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    const faq = invalidBundle.sections.find((s: any) => s.section_key === "faqs");
    faq.prompt = "Here are some business questions and answers: Q: price? A: 100";

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((err) =>
        err.includes("Answer ONLY from what's written here")
      )
    ).toBe(true);
  });

  it("fails when the 'faqs' section has outgoing edges", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    const faq = invalidBundle.sections.find((s: any) => s.section_key === "faqs");
    faq.edges = [{ to_key: "close", condition: "after answering" }];

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("null edges"))).toBe(true);
  });

  it("fails when first_response references an undefined variable", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    invalidBundle.first_response = "హలో అండి, {{unregistered_name}} గారేనా?";

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("unregistered_name"))).toBe(true);
  });

  it("fails when a section prompt references an undefined variable", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    invalidBundle.sections[1].prompt += " మీ కార్ నెంబర్ {{car_plate_number}} చెప్పగలరా?";

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.includes("car_plate_number"))).toBe(true);
  });

  it("fails when phone variable requirements are violated", () => {
    // Missing phone variable
    const noPhoneBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    noPhoneBundle.variables = noPhoneBundle.variables.filter((v: any) => !v.is_phone);

    const noPhoneResult = validateAgentBundleV2(noPhoneBundle);
    expect(noPhoneResult.valid).toBe(false);
    expect(noPhoneResult.errors.some((err) => err.includes("is_phone"))).toBe(true);

    // Invalid phone configuration (source != pre, required != true)
    const badPhoneBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    const phoneVar = badPhoneBundle.variables.find((v: any) => v.is_phone);
    phoneVar.source = "capture";
    phoneVar.required = false;

    const badPhoneResult = validateAgentBundleV2(badPhoneBundle);
    expect(badPhoneResult.valid).toBe(false);
    expect(
      badPhoneResult.errors.some((err) =>
        err.includes("Phone variable must have key 'phone', source 'pre', and required: true")
      )
    ).toBe(true);
  });

  it("fails when lead_name variable requirements are violated", () => {
    // Missing lead_name flag
    const noLeadNameBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    noLeadNameBundle.variables.forEach((v: any) => {
      v.is_lead_name = false;
    });

    const noLeadNameResult = validateAgentBundleV2(noLeadNameBundle);
    expect(noLeadNameResult.valid).toBe(false);
    expect(noLeadNameResult.errors.some((err) => err.includes("is_lead_name"))).toBe(true);
  });

  it("fails when language is Telugu but script has no Telugu characters", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    invalidBundle.exported_from.language = "te-IN";
    invalidBundle.first_response = "Hello, am I speaking with {{lead_name}}?";
    invalidBundle.sections.forEach((s: any) => {
      s.prompt = "This is a purely English prompt with no Telugu text.";
    });

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((err) =>
        err.includes("Language 'te-IN' specified, but script contains no Telugu text")
      )
    ).toBe(true);
  });

  it("fails when language is Hindi but script has no Hindi characters", () => {
    const invalidBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    invalidBundle.exported_from.language = "hi-IN";
    invalidBundle.first_response = "Hello, am I speaking with {{lead_name}}?";
    invalidBundle.sections.forEach((s: any) => {
      s.prompt = "This is a purely English prompt with no Hindi text.";
    });

    const result = validateAgentBundleV2(invalidBundle);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((err) =>
        err.includes("Language 'hi-IN' specified, but script contains no Hindi text")
      )
    ).toBe(true);
  });

  it("analyzes bundle variables to detect unused and undefined variables", () => {
    const bundle: AgentBundle = JSON.parse(JSON.stringify(raviInsuranceExample));
    const analysis = analyzeBundleVariables(bundle);

    // In raviInsuranceExample, lead_name and phone are used in first_response or prompts
    expect(analysis.usedVars.has("lead_name")).toBe(true);
    expect(analysis.usedVars.has("phone")).toBe(true);
    expect(analysis.undefinedVars).toHaveLength(0);
    // Some capture variables like vehicle_model are captured during call, not necessarily formatted as {{vehicle_model}} in prompts
    expect(analysis.definedVars.has("vehicle_model")).toBe(true);
  });

  it("repairs loose JSON output into a valid bundle_version: 2 bundle", () => {
    const looseJson = `
      {
        "exported_from": { "employee_name": "Suresh", "mode": "bulk", "language": "te-IN" },
        "first_response": "నమస్తే అండి {{lead_name}}",
        "sections": [
          { "label": "Opening", "prompt": "నమస్కారం అండి." },
          { "label": "Close", "prompt": "ధన్యవాదాలు అండి." }
        ]
      }
    `;

    const repaired = repairAgentBundleV2(looseJson);
    expect(repaired.bundle_version).toBe(2);
    expect(repaired.exported_from.employee_name).toBe("Suresh");
    expect(repaired.variables.some((v) => v.key === "phone" && v.is_phone)).toBe(true);
    expect(repaired.variables.some((v) => v.key === "lead_name" && v.is_lead_name)).toBe(true);
    expect(repaired.sections.some((s) => s.section_key === "faqs")).toBe(true);

    const validation = validateAgentBundleV2(repaired);
    expect(validation.valid).toBe(true);
  });
});

describe("E2E Happy-Path Flow: Generate -> Edit Section -> Publish", () => {
  it("completes full workflow from prompt description to edited publishable bundle", () => {
    // 1. User provides natural language description
    const userDescription =
      "We are a real estate company in Hyderabad selling plots in Shadnagar. The agent should call new enquiries, ask budget and location, and book site visits.";

    // 2. Generate agent bundle (using deterministic generator)
    const generatedBundle = generateDeterministicBundle({
      description: userDescription,
      mode: "instant",
      language: "te-IN",
      agentName: "ఇమ్రాన్",
    });

    // Verify initial generation satisfies all bundle_version: 2 criteria
    const initialValidation = validateAgentBundleV2(generatedBundle);
    expect(initialValidation.valid).toBe(true);
    expect(initialValidation.errors).toHaveLength(0);
    expect(generatedBundle.bundle_version).toBe(2);

    // 3. User edits a section in the script editor (/agents/[id]/edit)
    const editedBundle: AgentBundle = JSON.parse(JSON.stringify(generatedBundle));
    const siteVisitSection = editedBundle.sections.find(
      (s) => s.section_key === "book_site_visit"
    );
    expect(siteVisitSection).toBeDefined();

    if (siteVisitSection) {
      siteVisitSection.prompt =
        "ఈ శనివారం లేదా ఆదివారం ఉదయం 10 గంటలకు మా సైట్ విజిట్ కోసం ఫ్రీ క్యాబ్ బుక్ చేయమంటారా అండి? For example you might say: 'ఈ వీకెండ్ మా షాద్‌నగర్ వెంచర్ విజిట్‌కి ఫ్రీ క్యాబ్ పికప్ అరేంజ్ చేయమంటారా అండి?'";
    }

    // 4. User clicks "Publish": validate edited bundle for publication
    const publishValidation = validateAgentBundleV2(editedBundle);
    expect(publishValidation.valid).toBe(true);
    expect(publishValidation.errors).toHaveLength(0);
    expect(publishValidation.bundle).toBeDefined();
    expect(
      publishValidation.bundle?.sections.find((s) => s.section_key === "book_site_visit")?.prompt
    ).toContain("ఈ శనివారం లేదా ఆదివారం");

    // 5. Verify publish guard: if user mistakenly adds an undefined variable, publish is blocked
    const brokenEditBundle: AgentBundle = JSON.parse(JSON.stringify(editedBundle));
    brokenEditBundle.sections[0].prompt += " Please verify your {{unknown_reference_code}}.";
    const blockedValidation = validateAgentBundleV2(brokenEditBundle);
    expect(blockedValidation.valid).toBe(false);
    expect(
      blockedValidation.errors.some((err) => err.includes("unknown_reference_code"))
    ).toBe(true);
  });
});
