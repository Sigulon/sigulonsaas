import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUsageRecord extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId;
  durationSeconds: number;
  sttCost: number;
  llmCost: number;
  ttsCost: number;
  telephonyCost: number;
  platformMarkup: number;
  totalCredits: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const UsageRecordSchema = new Schema<IUsageRecord>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    callId: {
      type: Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      index: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
    },
    sttCost: {
      type: Number,
      default: 0,
    },
    llmCost: {
      type: Number,
      default: 0,
    },
    ttsCost: {
      type: Number,
      default: 0,
    },
    telephonyCost: {
      type: Number,
      default: 0,
    },
    platformMarkup: {
      type: Number,
      default: 0,
    },
    totalCredits: {
      type: Number,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "usage_records",
  }
);

UsageRecordSchema.index({ organizationId: 1, createdAt: -1 });

export const UsageRecordModel: Model<IUsageRecord> =
  mongoose.models.UsageRecord ||
  mongoose.model<IUsageRecord>("UsageRecord", UsageRecordSchema);
