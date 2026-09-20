import { CanonicalAgentConfig } from "./schema";

export interface InputAgentRecord {
  id?: string;
  org_id?: string;
  organization_id?: string;
  name?: string;
  voice_id?: string;
  language?: string;
  system_prompt?: string;
  introduction?: string | null;
  llm_provider?: string;
  llm_model?: string;
  stt_provider?: string;
  phone_number_id?: string | null;
  enabled_tools?: string[];
  settings?: {
    goals?: string[];
    rules?: string[];
    speed?: number;
    temperature?: number;
    stt_model?: string | null;
    tts_provider?: string;
    tts_model?: string;
    transfer_number?: string | null;
    max_call_duration_seconds?: number;
    silence_timeout_seconds?: number;
    record_calls?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export function validateAgentConfig(config: unknown): { valid: boolean; errors: string[]; data?: CanonicalAgentConfig } {
  const errors: string[] = [];
  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Config must be a non-null object"] };
  }

  // Accept BOTH the canonical snake_case shape and the camelCase DB shape
  // (Agent model stores _id/organizationId/systemPrompt/voiceId). Normalize
  // to snake_case for validation so neither side's valid configs are rejected.
  const raw = config as Record<string, unknown>;
  const norm: Record<string, unknown> = { ...raw };
  if (typeof raw._id !== "undefined" && typeof norm.id === "undefined") norm.id = String(raw._id);
  if (typeof raw.organizationId !== "undefined" && typeof norm.organization_id === "undefined") {
    norm.organization_id = String(raw.organizationId);
  }
  const normInstructions = { ...((norm.instructions ?? raw.instructions) as Record<string, unknown> | undefined ?? {}) } as Record<string, unknown>;
  const rawInstructions = (raw.instructions ?? {}) as Record<string, unknown>;
  if (typeof rawInstructions.systemPrompt !== "undefined" && typeof normInstructions.system_prompt === "undefined") {
    normInstructions.system_prompt = rawInstructions.systemPrompt;
  }
  norm.instructions = normInstructions;
  const normVoice = { ...((norm.voice ?? raw.voice) as Record<string, unknown> | undefined ?? {}) } as Record<string, unknown>;
  const rawVoice = (raw.voice ?? {}) as Record<string, unknown>;
  if (typeof rawVoice.voiceId !== "undefined" && typeof normVoice.voice_id === "undefined") {
    normVoice.voice_id = rawVoice.voiceId;
  }
  norm.voice = normVoice;

  const c = norm;
  if (!c.id || typeof c.id !== "string") errors.push("Missing or invalid 'id'");
  if (!c.organization_id || typeof c.organization_id !== "string") errors.push("Missing or invalid 'organization_id'");

  const identity = c.identity as Record<string, unknown> | undefined;
  const instructions = c.instructions as Record<string, unknown> | undefined;
  const voice = c.voice as Record<string, unknown> | undefined;
  const intelligence = c.intelligence as Record<string, unknown> | undefined;

  if (!identity?.name) errors.push("Missing identity.name");
  if (!instructions?.system_prompt) errors.push("Missing instructions.system_prompt");
  if (!voice?.voice_id) errors.push("Missing voice.voice_id");
  if (!intelligence?.model) errors.push("Missing intelligence.model");

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: c as unknown as CanonicalAgentConfig };
}

export function buildCanonicalConfig(
  agent: InputAgentRecord,
  company: string,
  overrides?: Partial<CanonicalAgentConfig>
): CanonicalAgentConfig {
  const settings = agent.settings ?? {};
  const {
    voice: _voiceOverride,
    intelligence: _intelligenceOverride,
    speech: _speechOverride,
    ...safeOverrides
  } = overrides ?? {};
  return {
    id: String(agent.id || ""),
    organization_id: String(agent.org_id || agent.organization_id || ""),
    identity: {
      name: String(agent.name || "AI Agent"),
      company,
    },
    instructions: {
      system_prompt: String(agent.system_prompt || ""),
      introduction: agent.introduction ?? null,
      goals: settings.goals ?? [],
      rules: settings.rules ?? [],
    },
    voice: {
      provider: "cartesia",
      voice_id: String(agent.voice_id || ""),
      language: String(agent.language || "hi"),
      speed: Number(settings.speed ?? 1.0),
    },
    intelligence: {
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      temperature: Number(settings.temperature ?? 0.7),
    },
    speech: {
      stt_provider: "cartesia",
      stt_model: null,
      tts_provider: "cartesia",
      tts_model: "sonic-3",
    },
    telephony: {
      provider: "plivo",
      phone_number_id: agent.phone_number_id ?? null,
      transfer_number: settings.transfer_number ?? null,
    },
    tools: agent.enabled_tools ?? [],
    settings: {
      max_call_duration_seconds: Number(settings.max_call_duration_seconds ?? 1800),
      silence_timeout_seconds: Number(settings.silence_timeout_seconds ?? 20),
      record_calls: Boolean(settings.record_calls ?? true),
    },
    ...safeOverrides,
  };
}

// ---------------------------------------------------------------------------
// Agent Bundle v2 Validation and Auto-Repair
// ---------------------------------------------------------------------------

import { AgentBundle, AgentBundleSection, AgentBundleVariable } from "./schema";

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
  bundle?: AgentBundle;
}

export function validateAgentBundle(data: unknown): BundleValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Agent bundle must be a non-null object"] };
  }

  const b = data as Record<string, unknown>;

  if (b.bundle_version !== 2) {
    errors.push(`Expected bundle_version: 2, received: ${b.bundle_version}`);
  }

  const exportedFrom = b.exported_from as Record<string, unknown> | undefined;
  if (!exportedFrom || typeof exportedFrom !== "object") {
    errors.push("Missing or invalid 'exported_from' object");
  } else {
    if (!exportedFrom.employee_name) errors.push("Missing 'exported_from.employee_name'");
    if (!exportedFrom.employee_role) errors.push("Missing 'exported_from.employee_role'");
    if (
      exportedFrom.mode !== "inbound" &&
      exportedFrom.mode !== "outbound" &&
      exportedFrom.mode !== "bulk"
    ) {
      errors.push("Field 'exported_from.mode' must be 'inbound', 'outbound', or 'bulk'");
    }
    if (!exportedFrom.language) errors.push("Missing 'exported_from.language'");
    if (exportedFrom.languages !== undefined && (!Array.isArray(exportedFrom.languages) || exportedFrom.languages.some((language) => typeof language !== "string" || !language.trim()))) {
      errors.push("Field 'exported_from.languages' must be an array of language codes when provided");
    }
  }

  if (typeof b.first_response !== "string" || !b.first_response.trim()) {
    errors.push("Field 'first_response' must be a non-empty string");
  }

  if (!Array.isArray(b.sections) || b.sections.length === 0) {
    errors.push("Field 'sections' must be a non-empty array");
  }

  if (!Array.isArray(b.variables)) {
    errors.push("Field 'variables' must be an array");
  }

  const sectionKeys = new Set<string>();
  const sectionOrders = new Set<number>();
  const sections = Array.isArray(b.sections) ? (b.sections as AgentBundleSection[]) : [];

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s.section_key || typeof s.section_key !== "string") {
      errors.push(`Section at index ${i} is missing 'section_key'`);
    } else {
      if (sectionKeys.has(s.section_key)) {
        errors.push(`Duplicate section_key '${s.section_key}' found at index ${i}`);
      }
      sectionKeys.add(s.section_key);
      if (!/^[a-z0-9_]+$/.test(s.section_key)) {
        errors.push(`Section key '${s.section_key}' must be formatted in snake_case`);
      }
    }

    if (!Number.isInteger(s.order) || s.order < 1) {
      errors.push(`Section '${s.section_key || i}' has an invalid order`);
    } else if (sectionOrders.has(s.order)) {
      errors.push(`Duplicate section order '${s.order}' found`);
    } else {
      sectionOrders.add(s.order);
    }

    if (s.node_type !== "llm" && s.node_type !== "tool" && s.node_type !== "transfer") {
      errors.push(`Section '${s.section_key || i}' has an invalid node_type`);
    }

    if (!s.label || typeof s.label !== "string") {
      errors.push(`Section '${s.section_key || i}' is missing 'label'`);
    }

    if (typeof s.prompt !== "string" || !s.prompt.trim()) {
      errors.push(`Section '${s.section_key || i}' has an empty prompt`);
    } else if (s.prompt.includes("```")) {
      errors.push(`Section '${s.section_key || i}' prompt contains illegal markdown code fences`);
    }
  }

  // Validate edges point to valid section keys
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (Array.isArray(s.edges)) {
      for (const edge of s.edges) {
        if (!edge.to_key || !sectionKeys.has(edge.to_key)) {
          errors.push(
            `Section '${s.section_key}' has edge pointing to non-existent section '${edge.to_key}'`
          );
        }
        if (!edge.condition || typeof edge.condition !== "string") {
          errors.push(
            `Section '${s.section_key}' edge to '${edge.to_key}' has missing or invalid condition`
          );
        }
      }
    } else if (s.edges !== null) {
      errors.push(`Section '${s.section_key}' edges must be an array or null`);
    }

    if (i < sections.length - 1 && (!Array.isArray(s.edges) || s.edges.length === 0)) {
      errors.push(`Non-terminal section '${s.section_key}' must have at least one edge`);
    }
    if (i === sections.length - 1 && s.edges !== null) {
      errors.push("The final section must have null edges");
    }
  }

  // Validate variables
  const variableKeys = new Set<string>();
  const variables = Array.isArray(b.variables) ? (b.variables as AgentBundleVariable[]) : [];

  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    if (!v.key || typeof v.key !== "string") {
      errors.push(`Variable at index ${i} is missing 'key'`);
    } else {
      if (variableKeys.has(v.key)) {
        errors.push(`Duplicate variable key '${v.key}' found at index ${i}`);
      }
      variableKeys.add(v.key);
      if (!/^[a-z0-9_]+$/.test(v.key)) {
        errors.push(`Variable key '${v.key}' must be formatted in snake_case`);
      }
    }

    if (v.source !== "pre" && v.source !== "capture") {
      errors.push(
        `Variable '${v.key || i}' has invalid source '${v.source}'. Must be 'pre' or 'capture'`
      );
    }

    if (typeof v.required !== "boolean") errors.push(`Variable '${v.key || i}' must declare required`);
    if (typeof v.is_phone !== "boolean") errors.push(`Variable '${v.key || i}' must declare is_phone`);
  }

  for (let expectedOrder = 1; expectedOrder <= sections.length; expectedOrder++) {
    if (!sectionOrders.has(expectedOrder)) {
      errors.push(`Section orders must be sequential from 1; missing order '${expectedOrder}'`);
    }
  }

  const phone = variables.find((variable) => variable.key === "phone" || variable.is_phone);
  if (!phone || phone.key !== "phone" || phone.source !== "pre" || !phone.required || !phone.is_phone) {
    errors.push("A required pre-call 'phone' variable with is_phone: true is required");
  }

  if (!sections.some((section) => section.section_key === "faqs")) {
    errors.push("A 'faqs' fallback section is required");
  }
  if (!sections.some((section) => section.section_key === "close" && section.edges === null)) {
    errors.push("A terminal 'close' section is required");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], bundle: b as unknown as AgentBundle };
}

/**
 * Repairs raw LLM text into a normalized and valid AgentBundle object.
 */
export function repairAgentBundle(rawInput: string | Record<string, unknown>): AgentBundle {
  let parsed: Record<string, unknown>;

  if (typeof rawInput === "string") {
    // 1. Strip markdown code block fences ```json ... ```
    let cleaned = rawInput.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
      cleaned = cleaned.replace(/\s*```$/, "");
    }

    // 2. Extract first JSON object match if extra text was prepended
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Replace trailing commas before closing braces/brackets
      const relaxed = cleaned.replace(/,\s*([\]}])/g, "$1");
      parsed = JSON.parse(relaxed);
    }
  } else {
    parsed = { ...rawInput };
  }

  // Ensure top-level fields
  parsed.bundle_version = 2;

  const exportedFrom = (parsed.exported_from as Record<string, unknown>) || {};
  parsed.exported_from = {
    employee_name: String(exportedFrom.employee_name || "AI Agent"),
    employee_role: String(exportedFrom.employee_role || "Representative"),
    mode:
      exportedFrom.mode === "inbound" ||
      exportedFrom.mode === "outbound" ||
      exportedFrom.mode === "bulk"
        ? exportedFrom.mode
        : "outbound",
    language: String(exportedFrom.language || "en"),
    ...(Array.isArray(exportedFrom.languages)
      ? { languages: exportedFrom.languages.filter((language): language is string => typeof language === "string" && Boolean(language.trim())) }
      : {}),
  };

  parsed.first_response = String(parsed.first_response || "Hello! How can I assist you today?").trim();

  // Normalize sections
  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    parsed.sections = [
      {
        section_key: "context_orient",
        label: "Greeting & Context",
        order: 1,
        enabled: true,
        node_type: "llm",
        edges: [{ to_key: "qualify_need", condition: "after caller acknowledges" }],
        prompt: "Greet the caller warmly. State your name and purpose. Ask how you can help.",
      },
      {
        section_key: "qualify_need",
        label: "Qualify Need",
        order: 2,
        enabled: true,
        node_type: "llm",
        edges: [{ to_key: "close", condition: "once qualification is complete" }],
        prompt: "Ask questions one at a time. Do not repeat already known info.",
      },
      {
        section_key: "close",
        label: "Call Wrap Up",
        order: 3,
        enabled: true,
        node_type: "llm",
        edges: null,
        prompt: "Thank the customer warmly and confirm next steps. End the call politely.",
      },
    ];
  } else {
    const rawSections = parsed.sections as Array<Record<string, unknown>>;
    const normalizedSections: AgentBundleSection[] = [];
    const validKeys = new Set<string>();

    rawSections.forEach((s, idx) => {
      let key = String(s.section_key || `section_${idx + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "") || `section_${idx + 1}`;
      if (validKeys.has(key)) key = `${key}_${idx + 1}`;
      validKeys.add(key);

      const promptCleaned = String(s.prompt || "Proceed with conversation.")
        .replace(/```/g, "")
        .trim();

      normalizedSections.push({
        section_key: key,
        label: String(s.label || `Section ${idx + 1}`),
        order: idx + 1,
        enabled: s.enabled !== false,
        node_type: (s.node_type as "llm" | "tool" | "transfer") || "llm",
        edges: Array.isArray(s.edges)
          ? (s.edges as Array<Record<string, unknown>>)
              .filter((e) => e && typeof e.to_key === "string")
              .map((e) => ({
                to_key: String(e.to_key).toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
                condition: String(e.condition || "on user response"),
              }))
          : null,
        prompt: promptCleaned,
      });
    });

    // Clean edges pointing to nonexistent sections and ensure a linear safe exit.
    normalizedSections.forEach((s, idx) => {
      if (idx === normalizedSections.length - 1) {
        s.edges = null;
      } else if (Array.isArray(s.edges)) {
        s.edges = s.edges.filter((e) => validKeys.has(e.to_key));
        if (s.edges.length === 0 && idx < normalizedSections.length - 1) {
          s.edges = [
            {
              to_key: normalizedSections[idx + 1].section_key,
              condition: "once section goal is met",
            },
          ];
        }
      } else {
        s.edges = [
          {
            to_key: normalizedSections[idx + 1].section_key,
            condition: "once this section goal is met",
          },
        ];
      }
    });

    parsed.sections = normalizedSections;
  }

  // Normalize variables
  if (!Array.isArray(parsed.variables)) {
    parsed.variables = [];
  }

  {
    const rawVars = parsed.variables as Array<Record<string, unknown>>;
    const seenKeys = new Set<string>();
    const normalizedVars: AgentBundleVariable[] = [];

    rawVars.forEach((v, idx) => {
      let key = String(v.key || `var_${idx}`)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^[0-9]+/, "");
      if (!key) key = `field_${idx}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const isLeadName = Boolean(v.is_lead_name || key === "lead_name" || key === "customer_name");
      const isPhone = Boolean(v.is_phone || key === "phone" || key === "phone_number");

      normalizedVars.push({
        key,
        label: String(v.label || key),
        source: v.source === "pre" ? "pre" : "capture",
        required: Boolean(v.required),
        extract_hint: v.extract_hint ? String(v.extract_hint) : null,
        is_phone: isPhone,
        is_lead_name: isLeadName,
        is_headline: Boolean(v.is_headline),
        value_type: (v.value_type as "text" | "number" | "date" | "boolean" | "choice") || "text",
        choices: Array.isArray(v.choices) ? (v.choices as string[]) : null,
      });
    });

    const phoneIndex = normalizedVars.findIndex((variable) => variable.key === "phone" || variable.is_phone);
    const canonicalPhone: AgentBundleVariable = {
      key: "phone",
      label: "Phone number",
      source: "pre",
      required: true,
      extract_hint: null,
      is_phone: true,
      is_lead_name: false,
      is_headline: false,
      value_type: "text",
      choices: null,
    };
    if (phoneIndex >= 0) {
      normalizedVars[phoneIndex] = canonicalPhone;
    } else {
      normalizedVars.unshift(canonicalPhone);
    }
    parsed.variables = normalizedVars;
  }

  const repairedSections = parsed.sections as AgentBundleSection[];
  if (!repairedSections.some((section) => section.section_key === "faqs")) {
    const faqSection: AgentBundleSection = {
      section_key: "faqs",
      label: "FAQs & Fallback",
      order: 0,
      enabled: true,
      node_type: "llm",
      edges: [],
      prompt: "Answer only with confirmed business knowledge. If the answer is unavailable, offer a human follow-up and end politely.",
    };
    const closeIndex = repairedSections.findIndex((section) => section.section_key === "close");
    if (closeIndex >= 0) {
      const close = repairedSections[closeIndex];
      const previous = repairedSections[closeIndex - 1];
      if (previous) {
        previous.edges = [{ to_key: "faqs", condition: "if the caller has a question or needs confirmed information" }];
      }
      faqSection.edges = [{ to_key: "close", condition: "once the question is answered or a follow-up is offered" }];
      close.edges = null;
      repairedSections.splice(closeIndex, 0, faqSection);
    } else {
      const previousLast = repairedSections[repairedSections.length - 1];
      if (previousLast) previousLast.edges = [{ to_key: "faqs", condition: "if the caller has a question or needs confirmed information" }];
      faqSection.edges = null;
      repairedSections.push(faqSection);
      repairedSections.push({
        section_key: "close",
        label: "Close",
        order: 0,
        enabled: true,
        node_type: "llm",
        edges: null,
        prompt: "Confirm the next step, thank the caller, and end the call politely.",
      });
      faqSection.edges = [{ to_key: "close", condition: "once the question is answered or a follow-up is offered" }];
    }
  }
  repairedSections.forEach((section, index) => {
    section.order = index + 1;
    if (index === repairedSections.length - 1) section.edges = null;
  });

  return parsed as unknown as AgentBundle;
}
