import { AgentBundle, AgentBundleSchema } from "./schema";

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
  bundle?: AgentBundle;
}

/**
 * Validates any raw agent bundle data against the unified Zod schema.
 */
export function validateAgentBundle(data: unknown): BundleValidationResult {
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Agent bundle must be a non-null object"] };
  }

  const result = AgentBundleSchema.safeParse(data);
  if (result.success) {
    return {
      valid: true,
      errors: [],
      bundle: result.data,
    };
  }

  const errors = result.error.issues.map((issue) => {
    const pathStr = issue.path.join(".");
    return pathStr ? `${pathStr}: ${issue.message}` : issue.message;
  });

  return {
    valid: false,
    errors,
  };
}

/**
 * Extracts variable placeholders {{var}} from a text string.
 */
export function extractVariableNames(text: string): string[] {
  const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(2, -2).trim())));
}

/**
 * Analyzes bundle variables for unused and undefined variables.
 */
export function analyzeBundleVariables(bundle: AgentBundle): {
  usedVars: Set<string>;
  definedVars: Set<string>;
  unusedVars: string[];
  undefinedVars: string[];
} {
  const definedVars = new Set(bundle.variables.map((v) => v.key));
  const usedVars = new Set<string>();

  for (const v of extractVariableNames(bundle.first_response)) {
    usedVars.add(v);
  }

  for (const section of bundle.sections) {
    for (const v of extractVariableNames(section.prompt)) {
      usedVars.add(v);
    }
  }

  const unusedVars = Array.from(definedVars).filter((v) => !usedVars.has(v));
  const undefinedVars = Array.from(usedVars).filter((v) => !definedVars.has(v));

  return {
    usedVars,
    definedVars,
    unusedVars,
    undefinedVars,
  };
}

/**
 * Repairs and normalizes loose LLM outputs into a bundle conforming to bundle_version 2.
 */
export function repairAgentBundle(rawInput: string | Record<string, unknown>): AgentBundle {
  let parsed: Record<string, unknown>;

  if (typeof rawInput === "string") {
    let cleaned = rawInput.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
      cleaned = cleaned.replace(/\s*```$/, "");
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const relaxed = cleaned.replace(/,\s*([\]}])/g, "$1");
      parsed = JSON.parse(relaxed);
    }
  } else {
    parsed = { ...rawInput };
  }

  parsed.bundle_version = 2;

  const rawExported = (parsed.exported_from as Record<string, unknown>) || {};
  const rawLang = String(rawExported.language || "te-IN").trim();
  const normalizedMode =
    rawExported.mode === "bulk" ||
    rawExported.mode === "instant" ||
    rawExported.mode === "inbound" ||
    rawExported.mode === "outbound"
      ? rawExported.mode
      : "bulk";

  parsed.exported_from = {
    employee_name: String(rawExported.employee_name || "Ravi").trim(),
    employee_role: String(rawExported.employee_role || "Representative").trim(),
    mode: normalizedMode,
    language: rawLang,
    ...(Array.isArray(rawExported.languages)
      ? {
          languages: rawExported.languages.filter(
            (l): l is string => typeof l === "string" && Boolean(l.trim())
          ),
        }
      : {}),
  };

  parsed.first_response = String(
    parsed.first_response || "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా?"
  ).trim();

  // Normalize sections
  const rawSections = Array.isArray(parsed.sections)
    ? (parsed.sections as Array<Record<string, unknown>>)
    : [];

  const validKeys = new Set<string>();
  const normalizedSections: any[] = [];

  rawSections.forEach((s, idx) => {
    const rawKey = s.section_key || (s.label ? String(s.label).toLowerCase().replace(/[^a-z0-9_]+/g, "_") : "");
    let key = String(rawKey || `section_${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!key) key = `section_${idx + 1}`;
    if (validKeys.has(key)) key = `${key}_${idx + 1}`;
    validKeys.add(key);

    const edges = Array.isArray(s.edges)
      ? (s.edges as Array<Record<string, unknown>>)
          .filter((e) => e && typeof e.to_key === "string")
          .map((e) => ({
            to_key: String(e.to_key).toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
            condition: String(e.condition || "on caller response").trim(),
          }))
      : null;

    normalizedSections.push({
      section_key: key,
      label: String(s.label || `Section ${idx + 1}`).trim(),
      order: idx + 1,
      enabled: s.enabled !== false,
      node_type: (s.node_type as "llm" | "tool" | "transfer") || "llm",
      edges,
      prompt: String(s.prompt || "Proceed with conversation.")
        .replace(/```/g, "")
        .trim(),
    });
  });

  // Ensure 'faqs' section exists with mandatory instruction
  const faqInstruction =
    "Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.";
  let faqIdx = normalizedSections.findIndex((s) => s.section_key === "faqs");
  if (faqIdx === -1) {
    normalizedSections.push({
      section_key: "faqs",
      label: "Business FAQs",
      order: normalizedSections.length + 1,
      enabled: true,
      node_type: "llm",
      edges: null,
      prompt: `${faqInstruction}\n\nFor example you might say: 'ఖచ్చితంగా అండి, మా దగ్గర పూర్తి వివరాలు ఉన్నాయి.'`,
    });
  } else {
    const faqSection = normalizedSections[faqIdx];
    faqSection.edges = null;
    if (!faqSection.prompt.includes(faqInstruction)) {
      faqSection.prompt = `${faqInstruction}\n\n${faqSection.prompt}`;
    }
  }

  // Ensure terminal close section exists if not already present
  if (!normalizedSections.some((s) => s.section_key === "close")) {
    normalizedSections.push({
      section_key: "close",
      label: "Wrap Up & Close",
      order: normalizedSections.length + 1,
      enabled: true,
      node_type: "llm",
      edges: null,
      prompt:
        "Thank the caller warmly and end the call. For example you might say: 'చాలా థ్యాంక్స్ అండి, హావ్ ఏ గ్రేట్ డే!'",
    });
  }

  // Re-index orders 1..N
  normalizedSections.forEach((s, idx) => {
    s.order = idx + 1;
  });

  // Clean edge references and connect sequential flow sections
  const allKeys = new Set(normalizedSections.map((s) => s.section_key));
  const nonTerminalSections = normalizedSections.filter(
    (s) => s.section_key !== "faqs" && s.section_key !== "close"
  );

  nonTerminalSections.forEach((s, idx) => {
    const nextSection = nonTerminalSections[idx + 1];
    const defaultTarget = nextSection ? nextSection.section_key : "close";

    if (!Array.isArray(s.edges) || s.edges.length === 0) {
      s.edges = [{ to_key: defaultTarget, condition: "on completion of this section" }];
    } else {
      s.edges = s.edges.filter((e: { to_key: string }) => allKeys.has(e.to_key));
      if (s.edges.length === 0) {
        s.edges = [{ to_key: defaultTarget, condition: "on completion of this section" }];
      }
    }
  });

  normalizedSections.forEach((s) => {
    if (s.section_key === "faqs" || s.section_key === "close") {
      s.edges = null;
    }
  });

  parsed.sections = normalizedSections;

  // Normalize variables
  const rawVars = Array.isArray(parsed.variables)
    ? (parsed.variables as Array<Record<string, unknown>>)
    : [];

  const seenVarKeys = new Set<string>();
  const normalizedVars: any[] = [];

  rawVars.forEach((v, idx) => {
    let key = String(v.key || `var_${idx}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!key) key = `field_${idx}`;
    if (seenVarKeys.has(key)) return;
    seenVarKeys.add(key);

    const isPhone = Boolean(v.is_phone || key === "phone");
    const isLeadName = Boolean(v.is_lead_name || key === "lead_name");

    normalizedVars.push({
      key,
      label: String(v.label || key).trim(),
      source: v.source === "pre" ? "pre" : "capture",
      required: isPhone ? true : Boolean(v.required),
      extract_hint: v.extract_hint ? String(v.extract_hint).trim() : null,
      is_phone: isPhone,
      is_lead_name: isLeadName,
      is_headline: Boolean(v.is_headline),
      value_type:
        v.value_type === "number" ||
        v.value_type === "date" ||
        v.value_type === "boolean" ||
        v.value_type === "choice"
          ? v.value_type
          : "text",
      choices: Array.isArray(v.choices) ? (v.choices as string[]) : null,
    });
  });

  // Guarantee exactly one phone variable
  const phoneIdx = normalizedVars.findIndex((v) => v.key === "phone");
  const phoneVar = {
    key: "phone",
    label: "Phone Number",
    source: "pre" as const,
    required: true,
    extract_hint: null,
    is_phone: true,
    is_lead_name: false,
    is_headline: false,
    value_type: "text" as const,
    choices: null,
  };
  if (phoneIdx >= 0) {
    normalizedVars[phoneIdx] = phoneVar;
  } else {
    normalizedVars.unshift(phoneVar);
  }

  // Guarantee exactly one lead_name variable with is_lead_name: true
  const leadIdx = normalizedVars.findIndex((v) => v.key === "lead_name");
  const leadVar = {
    key: "lead_name",
    label: "Lead Name",
    source: "pre" as const,
    required: false,
    extract_hint: null,
    is_phone: false,
    is_lead_name: true,
    is_headline: true,
    value_type: "text" as const,
    choices: null,
  };
  if (leadIdx >= 0) {
    normalizedVars[leadIdx] = { ...normalizedVars[leadIdx], ...leadVar };
  } else {
    normalizedVars.push(leadVar);
  }

  // Clean any multiple is_phone or is_lead_name flags
  normalizedVars.forEach((v) => {
    if (v.key !== "phone") v.is_phone = false;
    if (v.key !== "lead_name") v.is_lead_name = false;
  });

  parsed.variables = normalizedVars;

  return parsed as unknown as AgentBundle;
}
