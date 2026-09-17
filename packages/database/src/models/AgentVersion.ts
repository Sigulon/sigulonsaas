import mongoose, { Schema, Document, Model } from "mongoose";
import { CanonicalAgentConfig } from "./Agent";

export interface IAgentVersion extends Document {
  _id: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  versionNumber: number;
  config: CanonicalAgentConfig;
  specification?: Record<string, unknown> | null;
  bundle?: Record<string, unknown> | null;
  publishedBy?: mongoose.Types.ObjectId;
  changeSummary?: string;
  createdAt: Date;
}

const AgentVersionSchema = new Schema<IAgentVersion>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
    },
    specification: {
      type: Schema.Types.Mixed,
      default: null,
    },
    bundle: {
      type: Schema.Types.Mixed,
      default: null,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    changeSummary: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "agent_versions",
  }
);

AgentVersionSchema.index(
  { agentId: 1, versionNumber: 1 },
  { unique: true }
);

export const AgentVersionModel: Model<IAgentVersion> =
  mongoose.models.AgentVersion ||
  mongoose.model<IAgentVersion>("AgentVersion", AgentVersionSchema);
