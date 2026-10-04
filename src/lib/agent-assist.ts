import { AgentBundle } from "./agent-bundle/schema";
import { validateAgentBundle, repairAgentBundle } from "./agent-bundle/validator";
import { OPENROUTER_DEFAULT_MODEL } from "./types";

export interface SectionDiff {
  section_key: string;
  label: string;
  type: "modified" | "added" | "removed" | "unchanged";
  beforePrompt?: string;
  afterPrompt?: string;
  beforeEdges?: unknown;
  afterEdges?: unknown;
}

export interface AiAssistResult {
  modifiedBundle: AgentBundle;
  diff: {
    firstResponse: {
      before: string;
      after: string;
      changed: boolean;
    };
    sections: SectionDiff[];
  };
}

export async function applyAiAssist(
  bundle: AgentBundle,
  instruction: string
): Promise<AiAssistResult> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;

  let modified: AgentBundle | null = null;

  if (openRouterKey) {
    try {
      const systemPrompt = `You are an AI assistant that edits Sigulon voice agent bundles (bundle_version 2).
You will receive an existing Agent Bundle JSON and an editing instruction from the user.
Your job is to apply the requested changes carefully to the bundle.

RULES:
1. Return ONLY the modified Agent Bundle as a raw JSON object.
2. Maintain bundle_version === 2.
3. Keep the graph valid (no orphan sections, terminal close section has edges: null, faqs section has edges: null and exact disclaimer).
4. Exactly one phone variable (key "phone") and one lead_name variable (key "lead_name").
5. Every {{var}} used in first_response or any prompt must exist in variables[].
6. Every section prompt must end with "For example you might say: '...'".
7. Apply the instruction precisely (e.g. adjust politeness, add a section, rephrase questions, etc.).`;

      const userMessage = `Current Bundle:\n${JSON.stringify(bundle, null, 2)}\n\nUser Instruction:\n"${instruction}"\n\nReturn ONLY the modified valid JSON bundle.`;

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
          "HTTP-Referer": "https://sigulon.ai",
          "X-Title": "Sigulon AI Assist",
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const repaired = repairAgentBundle(content);
          if (validateAgentBundle(repaired).valid) {
            modified = repaired;
          }
        }
      }
    } catch (err) {
      console.warn("[applyAiAssist] OpenRouter assist error:", err);
    }
  }

  // Fallback heuristic if LLM unavailable
  if (!modified) {
    const clone = JSON.parse(JSON.stringify(bundle)) as AgentBundle;
    const lower = instruction.toLowerCase();
    if (lower.includes("polite") || lower.includes("respectful")) {
      clone.sections.forEach((s) => {
        if (!s.prompt.includes("దయచేసి") && !s.prompt.includes("అండి")) {
          s.prompt = s.prompt.replace("For example", "దయచేసి వినయంగా మాట్లాడండి. For example");
        }
      });
    } else if (lower.includes("short") || lower.includes("concise") || lower.includes("brief")) {
      clone.sections.forEach((s) => {
        s.prompt = s.prompt.replace("For example", "Keep reply under 15 words. For example");
      });
    } else {
      clone.sections.forEach((s) => {
        if (s.section_key !== "faqs") {
          s.prompt += ` Note: ${instruction}`;
        }
      });
    }
    modified = repairAgentBundle(clone as unknown as Record<string, unknown>);
  }

  // Compute diff
  const diffSections: SectionDiff[] = [];
  const beforeSectionsMap = new Map(bundle.sections.map((s) => [s.section_key, s]));
  const afterSectionsMap = new Map(modified.sections.map((s) => [s.section_key, s]));

  for (const afterSection of modified.sections) {
    const beforeSection = beforeSectionsMap.get(afterSection.section_key);
    if (!beforeSection) {
      diffSections.push({
        section_key: afterSection.section_key,
        label: afterSection.label,
        type: "added",
        afterPrompt: afterSection.prompt,
        afterEdges: afterSection.edges,
      });
    } else {
      const promptChanged = beforeSection.prompt.trim() !== afterSection.prompt.trim();
      const edgesChanged =
        JSON.stringify(beforeSection.edges) !== JSON.stringify(afterSection.edges);
      diffSections.push({
        section_key: afterSection.section_key,
        label: afterSection.label,
        type: promptChanged || edgesChanged ? "modified" : "unchanged",
        beforePrompt: beforeSection.prompt,
        afterPrompt: afterSection.prompt,
        beforeEdges: beforeSection.edges,
        afterEdges: afterSection.edges,
      });
    }
  }

  for (const beforeSection of bundle.sections) {
    if (!afterSectionsMap.has(beforeSection.section_key)) {
      diffSections.push({
        section_key: beforeSection.section_key,
        label: beforeSection.label,
        type: "removed",
        beforePrompt: beforeSection.prompt,
        beforeEdges: beforeSection.edges,
      });
    }
  }

  return {
    modifiedBundle: modified,
    diff: {
      firstResponse: {
        before: bundle.first_response,
        after: modified.first_response,
        changed: bundle.first_response !== modified.first_response,
      },
      sections: diffSections,
    },
  };
}
