import { AgentBundle } from "./agent-bundle/schema";
import { repairAgentBundle, validateAgentBundle } from "./agent-bundle/validator";
import { generateLiveKitChatCompletion, LIVEKIT_DEFAULT_LLM } from "./livekit";
import raviInsuranceExample from "../../docs/examples/ravi-insurance-bulk.json";
import imranRealEstateExample from "../../docs/examples/imran-realestate-instant.json";

export interface GenerationProgressCallback {
  (step: "understanding" | "designing" | "writing" | "validating", message: string): void | Promise<void>;
}

export interface GenerateAgentParams {
  description: string;
  mode?: "bulk" | "instant" | "inbound" | "outbound";
  language?: string;
  agentName?: string;
  gender?: "female" | "male";
  onProgress?: GenerationProgressCallback;
}

export interface GenerateAgentResult {
  bundle: AgentBundle;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  retryCount: number;
}

export const SYSTEM_PROMPT = `You are an expert AI Voice Agent Architect at Sigulon, specializing in telephony voice agents for SMBs in India, particularly Telugu, Hindi, and Indian English callers.

Your task is to take a business description or voice transcript and generate an exact Agent Bundle (bundle_version: 2) as a SINGLE JSON OBJECT.

CRITICAL FORMAT SPECIFICATIONS:
1. bundle_version must be exactly 2.
2. exported_from:
   - employee_name: appropriate Indian name (e.g. Ravi, Imran, Ramya, Priya, Harika, Karthik, etc.)
   - employee_role: e.g. "Insurance Lead Quality Checker", "Real Estate Property Consultant", "Clinic Coordinator", etc.
   - mode: one of "bulk", "instant", "inbound", "outbound" (matching user's intent)
   - language: "te-IN" for Telugu (default), "hi-IN" for Hindi, "en-IN" for English.
3. first_response: Spoken opening greeting. In outbound/bulk/instant modes, include {{lead_name}} with polite markers (e.g. "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా?").
4. sections: An array of node graph objects:
   - section_key: snake_case unique identifier (e.g. "greeting_purpose", "qualify_budget", "faqs", "close")
   - label: Human-readable label
   - order: sequential integer from 1 to N
   - enabled: true
   - node_type: "llm"
   - edges: Array of { to_key, condition } objects for routing, OR null for terminal sections.
     - Entry section is order 1.
     - Every to_key must reference an existing section_key.
     - No orphan sections: all sections must be reachable.
     - The "close" section is terminal (edges: null).
     - MANDATORY "faqs" section: section_key must be "faqs", edges must be null, containing Q:/A: lines based on the business info.
       The prompt for the "faqs" section MUST start with: "Answer ONLY from what's written here; if a question isn't listed, use your don't-know response."
   - prompt: Spoken instruction for this node:
     - 1 question at a time.
     - Warm, short sentences (maximum 2 spoken sentences).
      - Write spoken greetings and example dialogue in the user's selected language and script. Use Telugu-English mix only when Telugu is selected. JSON keys and mandatory instruction prefixes remain as specified.
     - EVERY section prompt MUST end with an example line starting: "For example you might say: '...'"
5. variables: Array of variable definitions:
   - key: snake_case (e.g. "phone", "lead_name", "budget", "visit_date_time")
   - label: Human-readable label
   - source: "pre" (supplied in lead list) or "capture" (extracted during call)
   - required: boolean
   - is_phone: EXACTLY ONE variable must have is_phone: true (key: "phone", source: "pre", required: true).
   - is_lead_name: EXACTLY ONE variable must have is_lead_name: true (key: "lead_name").
   - is_headline: boolean (true for primary display fields like lead_name or budget)
   - value_type: "text" | "number" | "date" | "boolean" | "choice"
   - choices: Array of strings if choice type, else null
   - extract_hint: Natural-language extraction guidance for LLM
   - RULE: Every {{variable}} placeholder used in first_response or any section prompt MUST exist in variables[].

FEW-SHOT REFERENCE EXAMPLES:
These examples demonstrate STRUCTURE ONLY. Never copy their business facts, names, locations, prices, offers, or services. Use only facts supplied in the business description. For missing facts, explicitly say the information is unavailable; do not invent answers. The selected language overrides the examples' language.

Example 1: Bulk Motor Insurance Agent (Ravi - Telugu)
${JSON.stringify(raviInsuranceExample, null, 2)}

Example 2: Instant Real Estate Lead Qualifier (Imran - Telugu)
${JSON.stringify(imranRealEstateExample, null, 2)}

OUTPUT ONLY VALID JSON. Do not include markdown fences, preambles, or explanations.`;

export async function generateAgentWithLlm(params: GenerateAgentParams): Promise<GenerateAgentResult> {
  const { onProgress } = params;

  if (onProgress) await onProgress("understanding", "Understanding your business…");
  const request = `Generate an Agent Bundle for this business description. Return ONLY the JSON object.

Business description: ${params.description}
Mode: ${params.mode || "bulk"}
Language: ${params.language || "te-IN"}
${params.agentName ? `Agent name: ${params.agentName}` : ""}
${params.gender ? `Agent gender: ${params.gender}` : ""}`;

  let retryCount = 0;
  let lastUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let model = LIVEKIT_DEFAULT_LLM;
  let rawResponse = "";
  let responseErrors: string[] = [];
  let lastValidationErrors: string[] = [];

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      retryCount = attempt;
      if (onProgress) await onProgress("designing", attempt ? "Repairing the call flow…" : "Designing the call flow…");
      if (onProgress) await onProgress("writing", attempt ? "Rewriting invalid JSON…" : "Writing the script…");

      const prompt = attempt === 0
        ? request
        : `${request}\n\nYour previous output was invalid. Fix it and return a complete valid bundle. Validation errors: ${
            responseErrors.join("; ") || "strict JSON parsing failed"
          }\nPrevious output:\n${rawResponse}`;
      const response = await generateLiveKitChatCompletion({
        messages: [{ role: "user", content: prompt }],
        systemPrompt: SYSTEM_PROMPT,
        language: params.language,
        model: LIVEKIT_DEFAULT_LLM,
        temperature: 0.2,
        maxTokens: 10000,
        includeUsage: true,
        structuredOutput: true,
      });
      rawResponse = response.content;
      model = response.model || LIVEKIT_DEFAULT_LLM;
      lastUsage = {
        promptTokens: lastUsage.promptTokens + response.promptTokens,
        completionTokens: lastUsage.completionTokens + response.completionTokens,
        totalTokens: lastUsage.totalTokens + response.totalTokens,
      };

      if (onProgress) await onProgress("validating", "Validating…");
      let validation: ReturnType<typeof validateAgentBundle> = {
        valid: false,
        errors: ["strict JSON parsing failed"],
      };
      try {
        const parsed = parseJsonObject(rawResponse);
        validation = validateAgentBundle(parsed);

        // The model often gets the conversation content right but misses
        // mechanical bundle rules (indexes, required system variables, FAQ
        // section, or a dangling edge). Normalize those deterministically
        // before spending another inference request on a repair.
        if (!validation.valid) {
          try {
            const source = parsed as Record<string, unknown>;
            const exportedFrom = source.exported_from && typeof source.exported_from === "object"
              ? source.exported_from as Record<string, unknown>
              : {};
            const normalized = repairAgentBundle({
              ...source,
              exported_from: {
                ...exportedFrom,
                mode: params.mode || "bulk",
                language: params.language || "te-IN",
              },
            });
            const repaired = validateAgentBundle(normalized);
            if (repaired.valid && repaired.bundle) validation = repaired;
            else lastValidationErrors = repaired.errors;
          } catch (repairError) {
            lastValidationErrors = [
              ...validation.errors,
              repairError instanceof Error ? `Structural repair failed: ${repairError.message}` : "Structural repair failed",
            ];
          }
        }
      } catch {
        // Also accept a fenced or trailing-comma JSON response when the
        // bundle repair helper can safely parse and normalize its structure.
        try {
          const normalized = repairAgentBundle(rawResponse);
          const repaired = validateAgentBundle({
            ...normalized,
            exported_from: {
              ...normalized.exported_from,
              mode: params.mode || "bulk",
              language: params.language || "te-IN",
            },
          });
          if (repaired.valid && repaired.bundle) validation = repaired;
          else lastValidationErrors = repaired.errors;
        } catch (repairError) {
          lastValidationErrors = [
            repairError instanceof Error ? repairError.message : "Strict JSON parsing failed",
          ];
        }
      }
      if (
        validation.valid &&
        validation.bundle &&
        validation.bundle.exported_from.language !== (params.language || "te-IN")
      ) {
        validation = { valid: false, errors: ["Output language must match selected language"] };
      }
      if (validation.valid && validation.bundle) {
        return { bundle: validation.bundle, tokenUsage: lastUsage, model, retryCount };
      }
      responseErrors = lastValidationErrors.length ? lastValidationErrors : validation.errors;
      lastValidationErrors = [];
    }
  } catch {
    throw new Error("Agent generation failed: LiveKit Inference is unavailable. Check configuration and try again.");
  }

  const detail = responseErrors.slice(0, 5).join("; ");
  console.error("[agent-generation] bundle validation failed", {
    errors: responseErrors,
    responseLength: rawResponse.length,
    retryCount,
  });
  throw new Error(
    `Agent generation failed: LiveKit returned an invalid bundle after one repair attempt.${
      detail ? ` Validation details: ${detail}` : " Please try again."
    }`
  );
}

/** Strictly parse the complete LLM response; markdown and surrounding prose are rejected. */
function parseJsonObject(raw: string): unknown {
  const value: unknown = JSON.parse(raw.trim());
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LiveKit response must be a JSON object");
  }
  return value;
}

/**
 * Creates a deterministic example for tests and explicit template workflows.
 * Production generation must never silently substitute this for model output.
 */
export function generateDeterministicBundle(params: GenerateAgentParams): AgentBundle {
  const { description, mode = "bulk", language = "te-IN", agentName } = params;
  const isTelugu = language.startsWith("te");
  const isHindi = language.startsWith("hi");

  const name = agentName || (isTelugu ? "రవి" : isHindi ? "రాహుల్" : "Ravi");
  const employeeRole = "Customer Relationship Executive";

  const firstResponse = isTelugu
    ? "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా?"
    : isHindi
    ? "नमस्ते, क्या मैं {{lead_name}} जी से बात कर रहा हूँ?"
    : "Hello, am I speaking with {{lead_name}}?";

  const isRealEstate = /plot|flat|property|real estate|villa|shadnagar|hyderabad/i.test(description);
  const isInsurance = /insurance|policy|motor|vehicle|health|claim/i.test(description);

  if (isInsurance && isTelugu) {
    const clone = JSON.parse(JSON.stringify(raviInsuranceExample)) as AgentBundle;
    clone.exported_from.mode = mode;
    if (agentName) clone.exported_from.employee_name = agentName;
    return clone;
  }

  if (isRealEstate && isTelugu) {
    const clone = JSON.parse(JSON.stringify(imranRealEstateExample)) as AgentBundle;
    clone.exported_from.mode = mode;
    if (agentName) clone.exported_from.employee_name = agentName;
    return clone;
  }

  // General business template tailored to description
  const bundle: AgentBundle = {
    bundle_version: 2,
    exported_from: {
      employee_name: name,
      employee_role: employeeRole,
      mode,
      language,
    },
    first_response: firstResponse,
    sections: [
      {
        section_key: "greeting_purpose",
        label: "Greeting & Purpose",
        order: 1,
        enabled: true,
        node_type: "llm",
        edges: [
          {
            to_key: "qualify_requirement",
            condition: "if lead confirms identity and is open to speaking",
          },
          {
            to_key: "close",
            condition: "if caller is busy, wrong number, or declines",
          },
        ],
        prompt: isTelugu
          ? `Introduce yourself as ${name} and explain that you are calling regarding their enquiry. Ask if this is a convenient time to speak. For example you might say: 'నమస్తే అండి, నేను మీ ఎంక్వైరీ గురించి మాట్లాడుతున్నాను. ఒక్క నిమిషం మాట్లాడవచ్చా అండి?'`
          : `Introduce yourself as ${name} and explain why you are calling. Keep it polite and brief. For example you might say: 'Hello, this is ${name}. I am calling regarding your recent enquiry. Is this a good time to speak?'`,
      },
      {
        section_key: "qualify_requirement",
        label: "Qualify Requirement",
        order: 2,
        enabled: true,
        node_type: "llm",
        edges: [
          {
            to_key: "confirm_next_step",
            condition: "once requirement details are captured",
          },
          {
            to_key: "faqs",
            condition: "if customer asks specific business questions",
          },
        ],
        prompt: isTelugu
          ? `Ask the customer about their requirement and what they are looking for. 1 question at a time. For example you might say: 'మీ రిక్వైర్మెంట్ గురించి కొద్దిగా చెప్పగలరా అండి?'`
          : `Ask about their requirement. Keep it to one short question. For example you might say: 'Could you share what you are looking for?'`,
      },
      {
        section_key: "confirm_next_step",
        label: "Confirm Next Step",
        order: 3,
        enabled: true,
        node_type: "llm",
        edges: [
          {
            to_key: "close",
            condition: "once next step or callback is agreed",
          },
        ],
        prompt: isTelugu
          ? `Offer to send the details directly to their WhatsApp {{phone}} or schedule a follow-up. For example you might say: 'మంచిదండి, పూర్తి వివరాలు మీ వాట్సాప్‌కి పంపించమంటారా?'`
          : `Offer to share details or schedule a follow-up. For example you might say: 'May I share the full details with you on WhatsApp?'`,
      },
      {
        section_key: "faqs",
        label: "Business FAQs",
        order: 4,
        enabled: true,
        node_type: "llm",
        edges: null,
        prompt: isTelugu
          ? `Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.\n\nQ: మీ ఆఫీస్ ఎక్కడ ఉంది?\nA: మా ఆఫీస్ హైదరాబాద్ నగరంలో ఉంది అండి.\n\nQ: వివరాలు ఎలా పంపుతారు?\nA: మీ నెంబర్ {{phone}} కి వాట్సాప్ ద్వారా పంపిస్తాము.\n\nFor example you might say: 'ఖచ్చితంగా అండి, పూర్తి వివరాలు మా టీమ్ మీకు అందిస్తుంది.'`
          : `Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.\n\nQ: Where are you located?\nA: We are based in Hyderabad.\n\nQ: How do you share details?\nA: We will send them directly to your phone {{phone}} via WhatsApp.\n\nFor example you might say: 'Certainly, we will share all details with you right away.'`,
      },
      {
        section_key: "close",
        label: "Call Wrap Up",
        order: 5,
        enabled: true,
        node_type: "llm",
        edges: null,
        prompt: isTelugu
          ? `Thank the customer warmly for their time. Do not introduce any new questions. For example you might say: 'చాలా థ్యాంక్స్ అండి మీ సమయం ఇచ్చినందుకు. హావ్ ఏ గ్రేట్ డే!'`
          : `Thank the customer warmly and end the call politely. For example you might say: 'Thank you for your time. Have a great day!'`,
      },
    ],
    variables: [
      {
        key: "phone",
        label: "Phone Number",
        source: "pre",
        required: true,
        extract_hint: null,
        is_phone: true,
        is_lead_name: false,
        is_headline: false,
        value_type: "text",
        choices: null,
      },
      {
        key: "lead_name",
        label: "Lead Name",
        source: "pre",
        required: false,
        extract_hint: null,
        is_phone: false,
        is_lead_name: true,
        is_headline: true,
        value_type: "text",
        choices: null,
      },
      {
        key: "customer_requirement",
        label: "Customer Requirement",
        source: "capture",
        required: false,
        extract_hint: "Extract specific requirement or interest stated by the caller",
        is_phone: false,
        is_lead_name: false,
        is_headline: false,
        value_type: "text",
        choices: null,
      },
    ],
  };

  return bundle;
}
