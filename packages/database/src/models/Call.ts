import mongoose, { Schema, Document, Model } from "mongoose";

export type CallState =
  | "CREATED"
  | "QUEUED"
  | "DIALING"
  | "RINGING"
  | "ANSWERED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "CANCELLED";

export type CallDirection = "inbound" | "outbound";

export interface ICall extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  agentVersionId?: mongoose.Types.ObjectId;
  campaignId?: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;
  phoneNumberId?: mongoose.Types.ObjectId;
  provider: string; // plivo
  providerCallId?: string; // Plivo CallUUID
  idempotencyKey?: string;
  direction: CallDirection;
  status: CallState;
  fromNumber?: string;
  toNumber: string;
  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSeconds: number;
  costCredits: number;
  recordingId?: mongoose.Types.ObjectId;
  transcriptId?: mongoose.Types.ObjectId;
  summary?: string;
  outcome?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CallSchema = new Schema<ICall>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },
    agentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "AgentVersion",
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      index: true,
    },
    phoneNumberId: {
      type: Schema.Types.ObjectId,
      ref: "PhoneNumber",
    },
    provider: {
      type: String,
      default: "plivo",
    },
    providerCallId: {
      type: String,
      index: true,
      sparse: true,
    },
    idempotencyKey: {
      type: String,
      sparse: true,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "CREATED",
        "QUEUED",
        "DIALING",
        "RINGING",
        "ANSWERED",
        "IN_PROGRESS",
        "COMPLETED",
        "FAILED",
        "BUSY",
        "NO_ANSWER",
        "CANCELLED",
      ],
      default: "CREATED",
      index: true,
    },
    fromNumber: {
      type: String,
      default: "",
    },
    toNumber: {
      type: String,
      required: true,
    },
    startedAt: {
      type: Date,
    },
    answeredAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    costCredits: {
      type: Number,
      default: 0,
    },
    recordingId: {
      type: Schema.Types.ObjectId,
      ref: "Recording",
    },
    transcriptId: {
      type: Schema.Types.ObjectId,
      ref: "Transcript",
    },
    summary: {
      type: String,
      default: "",
    },
    outcome: {
      type: String,
      default: "",
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "calls",
  }
);

CallSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
CallSchema.index({ organizationId: 1, campaignId: 1, createdAt: -1 });
CallSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    // Existing calls may store a null key. Only actual client-supplied
    // string keys participate in the duplicate-call constraint.
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

export const CallModel: Model<ICall> =
  mongoose.models.Call || mongoose.model<ICall>("Call", CallSchema);
