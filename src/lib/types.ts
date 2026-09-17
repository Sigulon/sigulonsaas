export type UserRole = "owner" | "admin" | "member" | "viewer";

export const OPENROUTER_GEMINI_25_FLASH = "google/gemini-2.5-flash";
export const CARTESIA_STT_PROVIDER = "cartesia";
export const CARTESIA_TTS_PROVIDER = "cartesia";
/** Sonic 3 supports the Indian languages exposed by Sigulon, including Telugu. */
export const CARTESIA_TTS_MODEL = "sonic-3";

export interface Organization {
  id: string;
  name: string;
  max_concurrent_calls: number;
  created_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: UserRole;
}

export interface OrgCredentials {
  org_id: string;
  cartesia_api_key_encrypted: string;
  encryption_iv: string;
  created_at: string;
}

export type AgentStatus = "draft" | "active" | "paused";

export interface VoiceAgent {
  id: string;
  org_id: string;
  cartesia_agent_id?: string;
  name: string;
  language: string;
  voice_id: string;
  system_prompt: string;
  introduction: string;
  status: AgentStatus;
  llm_provider?: "openrouter";
  llm_model?: "google/gemini-2.5-flash";
  enabled_tools?: string[];
  stt_provider?: "cartesia";
  settings?: Record<string, unknown>;
  /** Generated bundle v2; it is preserved through call config pre-warm. */
  bundle?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  phone_numbers?: PhoneNumber[];
}

export type PhoneDirection = "inbound" | "outbound" | "both";

export interface PhoneNumber {
  id: string;
  org_id: string;
  agent_id: string | null;
  cartesia_number_id?: string;
  provider?: string;
  provider_number_id?: string | null;
  phone_number: string;
  direction: PhoneDirection;
  country?: string | null;
  status?: string | null;
  capabilities?: string[];
  created_at: string;
}

export interface Contact {
  id: string;
  org_id: string;
  name: string | null;
  phone_number: string;
  normalized_phone: string | null;
  do_not_call: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type CampaignStatus = "draft" | "running" | "paused" | "completed";

export interface Campaign {
  id: string;
  org_id: string;
  agent_id: string;
  name: string;
  status: CampaignStatus;
  total_contacts: number;
  calls_completed: number;
  created_at: string;
  agent?: VoiceAgent;
}

export type ContactCallStatus =
  | "pending"
  | "queued"
  | "calling" // deprecated alias of "dialing"; kept for existing rows
  | "dialing"
  | "ringing"
  | "answered"
  | "completed"
  | "failed"
  | "busy"
  | "no_answer"
  | "skipped"
  | "dnc";

export interface CampaignContact {
  campaign_id: string;
  contact_id: string;
  call_status: ContactCallStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  contact?: Contact;
}

export type CallDirection = "inbound" | "outbound";
export type CallStatus =
  | "created"
  | "queued"
  | "dialing"
  | "ringing"
  | "answered"
  | "in_progress"
  | "completed"
  | "failed"
  | "busy"
  | "no_answer"
  | "cancelled"
  | "voicemail";

export type CallOutcome =
  | "interested"
  | "not_interested"
  | "callback_requested"
  | "voicemail"
  | "busy"
  | "wrong_number"
  | "completed";

export interface TranscriptMessage {
  role: "agent" | "user" | "system";
  text: string;
  timestamp?: string;
}

export interface CallRecord {
  id: string;
  org_id: string;
  agent_id: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  phone_number_id: string | null;
  cartesia_call_id: string;
  provider: string;
  provider_call_id: string | null;
  direction: CallDirection;
  to_number: string | null;
  from_number: string | null;
  status: CallStatus;
  duration_seconds: number;
  recording_url: string | null;
  transcript: TranscriptMessage[];
  outcome: CallOutcome | string | null;
  summary: string | null;
  cost_credits: number;
  metadata: Record<string, unknown>;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
  agent?: VoiceAgent;
}

export interface DashboardStats {
  total_calls: number;
  answered_calls: number;
  answer_rate_percentage: number;
  avg_duration_seconds: number;
  total_credits_spent: number;
  chart_data?: { date: string; calls: number; answered: number }[];
}

export interface CartesiaVoicePreset {
  id: string;
  name: string;
  gender: "female" | "male";
  accent: string;
  description: string;
  sampleAudio?: string;
}

export interface CallEvent {
  id: string;
  org_id: string;
  call_id: string;
  event: string;
  provider_event_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export interface Appointment {
  id: string;
  org_id: string;
  call_id: string | null;
  contact_id: string | null;
  agent_id: string | null;
  title: string;
  start_time: string;
  end_time: string | null;
  timezone: string;
  status: AppointmentStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Recording {
  id: string;
  org_id: string;
  call_id: string;
  storage_path: string;
  duration_seconds: number;
  mime_type: string;
  created_at: string;
}

export interface CreditAccount {
  org_id: string;
  balance_credits: number;
  reserved_credits: number;
  updated_at: string;
}

export type CreditLedgerEvent =
  | "credit_purchase"
  | "credit_grant"
  | "call_reservation"
  | "call_usage"
  | "call_refund"
  | "adjustment";

export interface CreditLedgerEntry {
  id: string;
  org_id: string;
  call_id: string | null;
  event: CreditLedgerEvent;
  amount_credits: number;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DNCEntry {
  org_id: string;
  normalized_phone: string;
  reason: string;
  created_at: string;
}
