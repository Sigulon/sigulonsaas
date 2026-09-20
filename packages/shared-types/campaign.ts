export type CampaignStatus =
  | "draft"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"; // DB Campaign model uses draft|running|paused|completed|cancelled; queued/failed kept for worker transitional reads.

export type CampaignContactStatus =
  | "pending"
  | "queued"
  | "calling"
  | "dialing"
  | "ringing"
  | "answered"
  | "completed"
  | "failed"
  | "busy"
  | "no_answer"
  | "skipped"
  | "dnc";

export interface CampaignRecord {
  id: string;
  org_id: string;
  agent_id: string;
  name: string;
  status: CampaignStatus;
  total_contacts: number;
  calls_completed: number;
  calls_failed: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CampaignContactRecord {
  id: string;
  campaign_id: string;
  contact_id: string;
  call_status: CampaignContactStatus;
  attempt_count: number;
  last_attempt_at?: string | null;
  next_attempt_at?: string | null;
  call_id?: string | null;
  created_at: string;
}
