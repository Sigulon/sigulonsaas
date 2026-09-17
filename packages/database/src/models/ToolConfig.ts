import mongoose, { Schema, Document, Model } from "mongoose";

export interface IToolConfig extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  toolId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ToolConfigSchema = new Schema<IToolConfig>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    toolId: {
      type: Schema.Types.ObjectId,
      ref: "Tool",
      required: true,
      index: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "tool_configs",
  }
);

ToolConfigSchema.index(
  { organizationId: 1, toolId: 1, agentId: 1 },
  { unique: true }
);

export const ToolConfigModel: Model<IToolConfig> =
  mongoose.models.ToolConfig ||
  mongoose.model<IToolConfig>("ToolConfig", ToolConfigSchema);
