export type AgentStatus = "ready" | "paused" | "draft" | "error";
export type AgentChannel = "campaigns" | "instant" | "inbound" | "all";

export interface FlowNode {
  id: string;
  key: string;
  label: string;
  order: number;
  nodeType: "llm" | "transfer" | "condition" | "end";
  prompt: string;
  edges?: Array<{ toKey: string; condition: string }> | null;
}

export interface AgentActions {
  transferCall?: boolean;
  transferNumber?: string;
  sendSms?: boolean;
  smsTemplate?: string;
  webhookUrl?: string;
  createCrmLead?: boolean;
  updateCrm?: boolean;
  scheduleCallback?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  channel: AgentChannel;
  language: string;
  languageCode: string;
  voiceProvider: string;
  voiceName: string;
  voiceId: string;
  speed: number;
  stability: number;
  pitch: number;
  phoneNumber?: string;
  phoneId?: string;
  callsToday: number;
  leadsCount: number;
  qualifiedCount: number;
  totalCalls: number;
  conversionRate: number; // e.g. 19%
  avgDurationSeconds: number;
  creditsUsed: number;
  description: string;
  industry: "Insurance" | "Real Estate" | "Education" | "Loans" | "Healthcare" | "Other";
  useCase: string;
  objective: string;
  personality: string;
  openingMessage: string;
  instructions: string;
  qualificationCriteria: string;
  forbiddenRules: string;
  flowNodes: FlowNode[];
  actions: AgentActions;
  preCallVariables: string[];
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  agentName: string;
  leadsCount: number;
  callsAttempted: number;
  callsConnected: number;
  qualifiedLeads: number;
  status: CampaignStatus;
  progress: number; // 0 - 100
  callerId: string;
  maxConcurrency: number;
  callingHours: { start: string; end: string };
  timezone: string;
  retryAttempts: number;
  retryDelayMinutes: number;
  dailyLimit: number;
  maxAttemptsPerLead: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type LeadChannel = "instant" | "bulk" | "inbound";
export type LeadStatus =
  | "new"
  | "contacted"
  | "interested"
  | "qualified"
  | "not_interested"
  | "callback"
  | "hot"
  | "invalid";

export interface LeadTimelineEvent {
  date: string;
  title: string;
  detail: string;
  type: "call" | "status_change" | "sms" | "webhook";
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  channel: LeadChannel;
  agentId: string;
  agentName: string;
  campaignId?: string;
  campaignName?: string;
  status: LeadStatus;
  qualificationScore: number; // 0 - 100
  lastContactedAt: string;
  totalCalls: number;
  durationSeconds: number;
  extractedVariables: Record<string, string | number>;
  transcriptSummary?: string;
  timeline: LeadTimelineEvent[];
  costCredits: number;
}

export type CallDirection = "inbound" | "outbound";
export type CallType = "instant" | "campaign" | "inbound";
export type CallOutcome =
  | "qualified"
  | "interested"
  | "callback"
  | "not_interested"
  | "unanswered"
  | "busy"
  | "failed";

export interface CallTranscriptLine {
  speaker: "agent" | "user";
  text: string;
  time: string;
}

export interface Call {
  id: string;
  callerNumber: string;
  calleeNumber: string;
  direction: CallDirection;
  type: CallType;
  agentId: string;
  agentName: string;
  campaignName?: string;
  durationSeconds: number;
  outcome: CallOutcome;
  costCredits: number;
  recordingUrl?: string;
  transcript: CallTranscriptLine[];
  aiSummary: string;
  keyTakeaways: string[];
  latencyMs: {
    livekit: number;
    stt: number;
    llm: number;
    tts: number;
  };
  createdAt: string;
}

export interface PhoneNumber {
  id: string;
  number: string;
  country: string;
  city: string;
  provider: "Plivo" | "Exotel" | "Twilio";
  assignedAgentId?: string;
  assignedAgentName?: string;
  type: "inbound" | "outbound" | "two_way";
  status: "active" | "pending" | "released";
  monthlyRentalInr: number;
  callsHandled: number;
  minutesUsed: number;
  createdAt: string;
}

export interface BillingTransaction {
  id: string;
  date: string;
  description: string;
  type: "usage" | "top_up" | "refund";
  callsCount?: number;
  minutesCount?: number;
  amountInr: number;
  status: "completed" | "pending" | "failed";
  invoiceId: string;
}

export interface Workspace {
  id: string;
  name: string;
  company: string;
  creditsBalance: number;
  activeCallsCount: number;
  plan: string;
  userName: string;
  userEmail: string;
  timezone: string;
  defaultLanguage: string;
}
