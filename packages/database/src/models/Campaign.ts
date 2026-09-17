import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICampaign extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  name: string;
  status: "draft" | "running" | "paused" | "completed" | "cancelled";
  totalContacts: number;
  callsCompleted: number;
  concurrencyLimit: number;
  retryConfig: {
    maxAttempts: number;
    initialDelaySecs: number;
    backoffMultiplier: number;
  };
  schedule?: {
    startTime?: string;
    endTime?: string;
    daysOfWeek?: number[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "running", "paused", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    totalContacts: {
      type: Number,
      default: 0,
    },
    callsCompleted: {
      type: Number,
      default: 0,
    },
    concurrencyLimit: {
      type: Number,
      default: 5,
    },
    retryConfig: {
      maxAttempts: { type: Number, default: 3 },
      initialDelaySecs: { type: Number, default: 300 },
      backoffMultiplier: { type: Number, default: 2.0 },
    },
    schedule: {
      startTime: { type: String },
      endTime: { type: String },
      daysOfWeek: { type: [Number] },
    },
  },
  {
    timestamps: true,
    collection: "campaigns",
  }
);

CampaignSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const CampaignModel: Model<ICampaign> =
  mongoose.models.Campaign ||
  mongoose.model<ICampaign>("Campaign", CampaignSchema);
