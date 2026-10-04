import { AgentBundle, AgentBundleSchema } from "./agent-bundle/schema";
import { validateAgentBundle, repairAgentBundle } from "./agent-bundle/validator";
import { OPENROUTER_DEFAULT_MODEL } from "./types";
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

const SYSTEM_PROMPT = `You are an expert AI Voice Agent Architect at Sigulon, specializing in telephony voice agents for SMBs in India, particularly Telugu, Hindi, and Indian English callers.

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
     - Conversational Telugu-English mix (use 'అండి' for respect; keep common English terms in English like enquiry, site visit, WhatsApp, loan, budget, etc.).
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

Example 1: Bulk Motor Insurance Agent (Ravi - Telugu)
${JSON.stringify(raviInsuranceExample, null, 2)}

Example 2: Instant Real Estate Lead Qualifier (Imran - Telugu)
${JSON.stringify(imranRealEstateExample, null, 2)}

OUTPUT ONLY VALID JSON. Do not include markdown fences, preambles, or explanations.`;

export async function generateAgentWithLlm(params: GenerateAgentParams): Promise<GenerateAgentResult> {
  const {
    description,
    mode = "bulk",
    language = "te-IN",
    agentName,
    gender,
    onProgress,
  } = params;

  if (onProgress) await onProgress("understanding", "Understanding your business…");

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;

  let promptTokens = 0;
  let completionTokens = 0;

  const userPrompt = `Generate a complete, valid bundle_version 2 agent for the following business:
Business Description: "${description.trim()}"
Preferred Mode: ${mode}
Target Language: ${language}
${agentName ? `Preferred Agent Name: ${agentName}` : ""}
${gender ? `Preferred Gender: ${gender}` : ""}

Ensure the script is written in natural, warm spoken ${language.startsWith("te") ? "Telugu-English code mix" : language.startsWith("hi") ? "Hindi-English code mix" : "Indian English"}.
Remember:
- Exactly one variable with is_phone: true (key "phone")
- Exactly one variable with is_lead_name: true (key "lead_name")
- All {{var}} placeholders used in prompts must exist in variables[]
- The "faqs" section must have edges: null and contain the required exact disclaimer instruction.
- Every section prompt must end with "For example you might say: '...'".
Output ONLY the raw JSON object.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let retryCount = 0;
  const MAX_RETRIES = 2;

  while (retryCount <= MAX_RETRIES) {
    if (retryCount === 0) {
      if (onProgress) await onProgress("designing", "Designing the call flow…");
    } else {
      if (onProgress) await onProgress("writing", `Refining call script (attempt ${retryCount + 1})…`);
    }

    let rawOutput: string | null = null;

    if (openRouterKey) {
      try {
        if (retryCount === 0 && onProgress) {
          await onProgress("writing", "Writing the script…");
        }

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openRouterKey}`,
            "HTTP-Referer": "https://sigulon.ai",
            "X-Title": "Sigulon AI Agent Generator",
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            response_format: { type: "json_object" },
            messages,
          }),
          signal: AbortSignal.timeout(28000),
        });

        if (res.ok) {
          const data = await res.json();
          rawOutput = data.choices?.[0]?.message?.content || "";
          if (data.usage) {
            promptTokens += Number(data.usage.prompt_tokens || 0);
            completionTokens += Number(data.usage.completion_tokens || 0);
          }
        } else {
          console.warn("[generateAgentWithLlm] OpenRouter call failed:", res.status, await res.text());
        }
      } catch (err) {
        console.warn("[generateAgentWithLlm] OpenRouter fetch error:", err);
      }
    }

    if (onProgress) await onProgress("validating", "Validating…");

    // If OpenRouter was offline or returned empty, generate using deterministic fallback
    let candidateBundle: AgentBundle;
    if (rawOutput) {
      try {
        const repaired = repairAgentBundle(rawOutput);
        candidateBundle = repaired;
      } catch (err) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          messages.push({
            role: "assistant",
            content: rawOutput || "",
          });
          messages.push({
            role: "user",
            content: `Your previous response was not valid JSON: ${err instanceof Error ? err.message : String(err)}. Please output strictly valid JSON conforming to the schema.`,
          });
          continue;
        }
        candidateBundle = generateDeterministicBundle(params);
      }
    } else {
      candidateBundle = generateDeterministicBundle(params);
    }

    // Validate against strict Zod schema
    const validation = validateAgentBundle(candidateBundle);
    if (validation.valid && validation.bundle) {
      return {
        bundle: validation.bundle,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        model,
        retryCount,
      };
    }

    // Validation failed: retry if attempts remain
    if (retryCount < MAX_RETRIES && openRouterKey && rawOutput) {
      retryCount++;
      messages.push({
        role: "assistant",
        content: rawOutput,
      });
      messages.push({
        role: "user",
        content: `Validation failed with the following errors:\n${validation.errors.join("\n")}\n\nPlease fix every error listed above and output the updated valid JSON bundle.`,
      });
      continue;
    }

    // Attempt automatic repair as a final measure
    try {
      const repaired = repairAgentBundle(candidateBundle as unknown as Record<string, unknown>);
      const repairedValidation = validateAgentBundle(repaired);
      if (repairedValidation.valid && repairedValidation.bundle) {
        return {
          bundle: repairedValidation.bundle,
          tokenUsage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
          model,
          retryCount,
        };
      }
    } catch {}

    // Fall back to clean deterministic template synthesized for this description
    const fallbackBundle = generateDeterministicBundle(params);
    return {
      bundle: fallbackBundle,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model,
      retryCount,
    };
  }

  const fallbackBundle = generateDeterministicBundle(params);
  return {
    bundle: fallbackBundle,
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    model,
    retryCount,
  };
}

/**
 * Creates a valid, tailored bundle when the LLM is unreachable or during test environments.
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
