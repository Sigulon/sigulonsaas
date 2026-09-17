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

export type CallDirection = "inbound" | "outbound";

export type TelephonyProvider = "plivo" | "twilio" | "cartesia";

export interface CallRecord {
  id: string;
  org_id: string;
  agent_id: string;
  campaign_id?: string | null;
  contact_id?: string | null;
  phone_number_id?: string | null;
  provider: TelephonyProvider;
  provider_call_id?: string | null;
  to_number: string;
  from_number?: string | null;
  direction: CallDirection;
  status: CallStatus;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  cost_credits?: number | null;
  recording_url?: string | null;
  transcript?: unknown | null;
  summary?: string | null;
  outcome?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VoiceSessionRecord {
  session_id: string;
  call_id: string;
  agent_id: string;
  organization_id: string;
  provider_call_id?: string | null;
  worker_id?: string | null;
  status: CallStatus;
  started_at: string;
  ended_at?: string | null;
  created_at?: string;
}
