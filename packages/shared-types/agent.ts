export type LLMProvider = "openrouter";
export type STTProvider = "cartesia";
export type TTSProvider = "cartesia";
export type TelephonyService = "plivo" | "twilio";

export interface AgentToolsConfig {
  availability: boolean;
  pricing: boolean;
  appointment: boolean;
  crm: boolean;
  transfer: boolean;
}

export interface AgentIdentity {
  id: string;
  organization_id: string;
  name: string;
}

export interface AgentInstructions {
  system_prompt: string;
  language: string;
  introduction?: string;
}

export interface AgentVoice {
  provider: TTSProvider;
  voice_id: string;
  speed?: number;
}

export interface AgentIntelligence {
  llm_provider: LLMProvider;
  llm_model: string;
  temperature: number;
}

export interface AgentSpeech {
  stt_provider: STTProvider;
  stt_model?: string;
  tts_provider: TTSProvider;
  tts_model?: string;
}

export interface AgentTelephony {
  provider: TelephonyService;
  phone_number_id?: string | null;
  transfer_number?: string | null;
}

export interface CanonicalAgent {
  identity: AgentIdentity;
  instructions: AgentInstructions;
  voice: AgentVoice;
  intelligence: AgentIntelligence;
  speech: AgentSpeech;
  telephony: AgentTelephony;
  tools: AgentToolsConfig;
  settings?: Record<string, unknown>;
}
