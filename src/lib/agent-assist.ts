import { AgentBundle } from "./agent-bundle/schema";
import { repairAgentBundle } from "./agent-bundle/validator";

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

  const modified = repairAgentBundle(clone as unknown as Record<string, unknown>);

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
