import { z } from "zod";

export const AgentModeSchema = z.enum(["bulk", "instant", "inbound", "outbound"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const VariableSourceSchema = z.enum(["pre", "capture"]);
export type VariableSource = z.infer<typeof VariableSourceSchema>;

export const VariableValueTypeSchema = z.enum(["text", "number", "date", "boolean", "choice"]);
export type VariableValueType = z.infer<typeof VariableValueTypeSchema>;

export const NodeTypeSchema = z.enum(["llm", "tool", "transfer"]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const AgentBundleVariableSchema = z.object({
  key: z
    .string()
    .min(1, "Variable key cannot be empty")
    .regex(/^[a-z0-9_]+$/, "Variable key must be lowercase snake_case"),
  label: z.string().min(1, "Variable label cannot be empty"),
  source: VariableSourceSchema,
  required: z.boolean(),
  extract_hint: z.string().nullable().optional().default(null),
  is_phone: z.boolean().default(false),
  is_lead_name: z.boolean().default(false),
  is_headline: z.boolean().default(false),
  value_type: VariableValueTypeSchema.default("text"),
  choices: z.array(z.string()).nullable().optional().default(null),
});
export type AgentBundleVariable = z.infer<typeof AgentBundleVariableSchema>;

export const AgentBundleEdgeSchema = z.object({
  to_key: z
    .string()
    .min(1, "Edge to_key cannot be empty")
    .regex(/^[a-z0-9_]+$/, "Target section key must be lowercase snake_case"),
  condition: z.string().min(1, "Edge condition cannot be empty"),
});
export type AgentBundleEdge = z.infer<typeof AgentBundleEdgeSchema>;

export const AgentBundleSectionSchema = z.object({
  section_key: z
    .string()
    .min(1, "Section key cannot be empty")
    .regex(/^[a-z0-9_]+$/, "Section key must be lowercase snake_case"),
  label: z.string().min(1, "Section label cannot be empty"),
  order: z.number().int().min(1, "Section order must be a positive integer starting at 1"),
  enabled: z.boolean().default(true),
  node_type: NodeTypeSchema.default("llm"),
  edges: z.array(AgentBundleEdgeSchema).nullable(),
  prompt: z.string().min(1, "Section prompt cannot be empty"),
});
export type AgentBundleSection = z.infer<typeof AgentBundleSectionSchema>;

export const AgentBundleExportedFromSchema = z.object({
  employee_name: z.string().min(1, "Employee name is required"),
  employee_role: z.string().min(1, "Employee role is required"),
  mode: AgentModeSchema,
  language: z.string().min(2, "Language code is required (e.g. te-IN, hi-IN, en-IN)"),
  languages: z.array(z.string()).optional(),
});
export type AgentBundleExportedFrom = z.infer<typeof AgentBundleExportedFromSchema>;

/**
 * Source of Truth Agent Bundle Schema (bundle_version 2).
 * Enforces graph integrity, single phone/lead_name variables, valid template variables,
 * FAQs section requirements, and script language consistency.
 */
export const AgentBundleSchema = z
  .object({
    bundle_version: z.literal(2),
    exported_from: AgentBundleExportedFromSchema,
    first_response: z.string().min(1, "First response cannot be empty"),
    sections: z.array(AgentBundleSectionSchema).min(1, "At least one section is required"),
    variables: z.array(AgentBundleVariableSchema),
  })
  .superRefine((bundle, ctx) => {
    // 1. Variable validation
    const varKeys = new Set<string>();
    let phoneCount = 0;
    let leadNameCount = 0;

    for (let i = 0; i < bundle.variables.length; i++) {
      const v = bundle.variables[i];
      if (varKeys.has(v.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate variable key '${v.key}' found.`,
          path: ["variables", i, "key"],
        });
      }
      varKeys.add(v.key);

      if (v.is_phone) {
        phoneCount++;
        if (v.key !== "phone" || v.source !== "pre" || !v.required) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Phone variable must have key 'phone', source 'pre', and required: true.",
            path: ["variables", i],
          });
        }
      }

      if (v.is_lead_name) {
        leadNameCount++;
        if (v.key !== "lead_name") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Lead name variable must have key 'lead_name'.",
            path: ["variables", i],
          });
        }
      }
    }

    if (phoneCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exactly one variable with is_phone: true is required (found ${phoneCount}).`,
        path: ["variables"],
      });
    }

    if (leadNameCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exactly one variable with is_lead_name: true is required (found ${leadNameCount}).`,
        path: ["variables"],
      });
    }

    // 2. Sections graph validation
    const sectionKeys = new Set<string>();
    const sectionOrders = new Set<number>();

    for (let i = 0; i < bundle.sections.length; i++) {
      const s = bundle.sections[i];
      if (sectionKeys.has(s.section_key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate section_key '${s.section_key}' found.`,
          path: ["sections", i, "section_key"],
        });
      }
      sectionKeys.add(s.section_key);

      if (sectionOrders.has(s.order)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate section order '${s.order}' found.`,
          path: ["sections", i, "order"],
        });
      }
      sectionOrders.add(s.order);
    }

    // Check orders are sequential 1..N
    for (let o = 1; o <= bundle.sections.length; o++) {
      if (!sectionOrders.has(o)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section orders must be sequential from 1 to ${bundle.sections.length}. Missing order ${o}.`,
          path: ["sections"],
        });
        break;
      }
    }

    // Check edge targets and build adjacency for reachability
    const adjacency = new Map<string, string[]>();
    for (const key of sectionKeys) {
      adjacency.set(key, []);
    }

    for (let i = 0; i < bundle.sections.length; i++) {
      const s = bundle.sections[i];
      if (Array.isArray(s.edges)) {
        if (s.edges.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section '${s.section_key}' has empty edges array; use null for terminal sections.`,
            path: ["sections", i, "edges"],
          });
        }
        for (let j = 0; j < s.edges.length; j++) {
          const edge = s.edges[j];
          if (!sectionKeys.has(edge.to_key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Edge in section '${s.section_key}' points to non-existent section '${edge.to_key}'.`,
              path: ["sections", i, "edges", j, "to_key"],
            });
          } else {
            adjacency.get(s.section_key)?.push(edge.to_key);
          }
        }
      }
    }

    // Reachability check from entry section (order 1)
    const sortedSections = [...bundle.sections].sort((a, b) => a.order - b.order);
    const entrySection = sortedSections[0];
    if (entrySection) {
      const reachable = new Set<string>();
      const queue = [entrySection.section_key];
      reachable.add(entrySection.section_key);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adjacency.get(curr) || [];
        for (const n of neighbors) {
          if (!reachable.has(n)) {
            reachable.add(n);
            queue.push(n);
          }
        }
      }

      // Identify orphan sections (reachable must include all except faqs if faqs is standalone fallback)
      for (const s of bundle.sections) {
        if (!reachable.has(s.section_key) && s.section_key !== "faqs") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unreachable section '${s.section_key}' cannot be reached from entry section '${entrySection.section_key}'.`,
            path: ["sections"],
          });
        }
      }
    }

    // 3. FAQs section check
    const faqsSection = bundle.sections.find((s) => s.section_key === "faqs");
    if (!faqsSection) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bundle must include a 'faqs' section.",
        path: ["sections"],
      });
    } else {
      if (faqsSection.edges !== null && (!Array.isArray(faqsSection.edges) || faqsSection.edges.length > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'faqs' section must have null edges.",
          path: ["sections"],
        });
      }
      const requiredFaqInstruction = "Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.";
      if (!faqsSection.prompt.includes(requiredFaqInstruction)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The 'faqs' section prompt must contain the exact instruction: "${requiredFaqInstruction}"`,
          path: ["sections"],
        });
      }
    }

    // 4. Template variables referenced check {{var}}
    const extractTemplateVars = (text: string): string[] => {
      const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
      return matches.map((m) => m.slice(2, -2).trim());
    };

    const firstResponseVars = extractTemplateVars(bundle.first_response);
    for (const v of firstResponseVars) {
      if (!varKeys.has(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Variable '{{${v}}}' in first_response is not defined in variables[].`,
          path: ["first_response"],
        });
      }
    }

    for (let i = 0; i < bundle.sections.length; i++) {
      const s = bundle.sections[i];
      const promptVars = extractTemplateVars(s.prompt);
      for (const v of promptVars) {
        if (!varKeys.has(v)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Variable '{{${v}}}' used in section '${s.section_key}' prompt is not defined in variables[].`,
            path: ["sections", i, "prompt"],
          });
        }
      }
    }

    // 5. Language consistency check
    const lang = bundle.exported_from.language.toLowerCase();
    const teluguRegex = /[\u0C00-\u0C7F]/;
    const hindiRegex = /[\u0900-\u097F]/;

    if (lang.startsWith("te")) {
      const hasTelugu =
        teluguRegex.test(bundle.first_response) ||
        bundle.sections.some((s) => teluguRegex.test(s.prompt));
      if (!hasTelugu) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Language '${bundle.exported_from.language}' specified, but script contains no Telugu text.`,
          path: ["exported_from", "language"],
        });
      }
    } else if (lang.startsWith("hi")) {
      const hasHindi =
        hindiRegex.test(bundle.first_response) ||
        bundle.sections.some((s) => hindiRegex.test(s.prompt));
      if (!hasHindi) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Language '${bundle.exported_from.language}' specified, but script contains no Hindi text.`,
          path: ["exported_from", "language"],
        });
      }
    }
  });

export type AgentBundle = z.infer<typeof AgentBundleSchema>;
