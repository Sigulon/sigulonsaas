import {
  CallStatus,
  CallDirection,
  TelephonyProvider,
  VoiceSessionRecord,
  OrgRole,
} from "@sigulon/shared-types";

export type {
  CallStatus,
  CallDirection,
  TelephonyProvider,
  VoiceSessionRecord,
  OrgRole,
};

export interface DatabaseOrganization {
  id: string;
  name: string;
  max_concurrent_calls: number;
  created_at: string;
  updated_at?: string;
}

export interface DatabaseOrgMember {
  id?: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at?: string;
}

export interface DatabaseVoiceAgent {
  id: string;
  org_id: string;
  cartesia_agent_id?: string;
  name: string;
  language: string;
  voice_id: string;
  system_prompt: string;
  introduction?: string | null;
  status: "draft" | "active" | "paused";
  llm_provider?: string;
  llm_model?: string;
  stt_provider?: string;
  enabled_tools?: string[];
  settings?: Record<string, unknown>;
  phone_number_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatabaseCall {
  id: string;
  org_id: string;
  agent_id: string;
  campaign_id?: string | null;
  contact_id?: string | null;
  phone_number_id?: string | null;
  provider: TelephonyProvider;
  provider_call_id?: string | null;
  cartesia_call_id?: string | null;
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
  updated_at?: string;
}

export interface DatabaseAppointment {
  id: string;
  org_id: string;
  agent_id?: string | null;
  contact_id?: string | null;
  call_id?: string | null;
  title: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "cancelled" | "completed";
  notes?: string | null;
  created_at: string;
}
