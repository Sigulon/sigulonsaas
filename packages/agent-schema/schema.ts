export interface CanonicalAgentConfig {
  id: string;
  organization_id: string;
  call_id?: string;
  direction?: "inbound" | "outbound";

  identity: {
    name: string;
    company: string;
  };

  instructions: {
    system_prompt: string;
    introduction?: string | null;
    goals: string[];
    rules: string[];
  };

  voice: {
    provider: "cartesia";
    voice_id: string;
    language: string;
    speed: number;
  };

  intelligence: {
    provider: "openrouter";
    model: "google/gemini-2.5-flash";
    temperature?: number;
  };

  speech: {
    stt_provider: "cartesia";
    stt_model?: string | null;
    tts_provider: "cartesia";
    tts_model: "sonic-3";
  };

  telephony: {
    provider: string;
    phone_number_id?: string | null;
    transfer_number?: string | null;
  };

  tools: string[];

  settings: {
    max_call_duration_seconds: number;
    silence_timeout_seconds: number;
    record_calls: boolean;
  };

  /** Serialized bundle v2 travels with pre-warmed runtime configurations. */
  bundle?: AgentBundle | null;
}
export function callConfigCacheKey(callId: string): string {
  return `sigulon:call:${callId}:config`;
}

// ---------------------------------------------------------------------------
// Internal Agent Specification (Source of Truth from 12-step wizard)
// ---------------------------------------------------------------------------

/** `bulk` is an outbound campaign mode with pre-loaded lead data. */
export type CallType = "inbound" | "outbound" | "bulk";

export interface QualificationField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "choice";
  required: boolean;
  description?: string;
  choices?: string[];
}

export interface PreCallVariable {
  key: string;
  label: string;
  source: "pre";
  value_type?: "text" | "number" | "date" | "boolean";
  description?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ActionItem {
  action: string;
  required_fields?: string[];
  description?: string;
}

export interface AgentSpecification {
  call_type: CallType;
  agent: {
    name: string;
    role: string;
  };
  call_purpose: string;
  desired_outcomes: string[];
  qualification_fields: QualificationField[];
  pre_call_variables: PreCallVariable[];
  business_knowledge: string;
  faqs: FAQItem[];
  actions: ActionItem[];
  language: string;
  /** Primary language first; supports natural language switching at runtime. */
  languages?: string[];
  auto_language_switch: boolean;
  personality: string[];
  conversation_style: "concise" | "balanced" | "conversational";
  rules: string[];
}

/** Natural-language input accepted by POST /api/agents/generate. */
export interface VoiceAgentGenerationInput {
  mode: CallType;
  language: string;
  languages?: string[];
  business_description: string;
  agent_goal: string;
  data_to_collect?: Array<
    | string
    | {
        key?: string;
        label: string;
        required?: boolean;
        source?: "pre" | "capture";
        value_type?: "text" | "number" | "date" | "boolean" | "choice";
        choices?: string[];
        extract_hint?: string;
      }
  >;
  pre_call_variables?: PreCallVariable[];
  business_knowledge?: string;
  faqs?: FAQItem[];
  agent_name?: string;
  agent_role?: string;
}

// ---------------------------------------------------------------------------
// Standardized Agent Bundle (bundle_version: 2)
// ---------------------------------------------------------------------------

export interface AgentBundleEdge {
  to_key: string;
  condition: string;
}

export interface AgentBundleSection {
  section_key: string;
  label: string;
  order: number;
  enabled: boolean;
  node_type: "llm" | "tool" | "transfer";
  edges: AgentBundleEdge[] | null;
  prompt: string;
}

export interface AgentBundleVariable {
  key: string;
  label: string;
  source: "pre" | "capture";
  required: boolean;
  extract_hint: string | null;
  is_phone: boolean;
  is_lead_name: boolean;
  is_headline: boolean;
  value_type: "text" | "number" | "date" | "boolean" | "choice";
  choices: string[] | null;
}

export interface AgentBundle {
  bundle_version: 2;
  exported_from: {
    employee_name: string;
    employee_role: string;
    mode: CallType;
    language: string;
    languages?: string[];
  };
  first_response: string;
  sections: AgentBundleSection[];
  variables: AgentBundleVariable[];
}
