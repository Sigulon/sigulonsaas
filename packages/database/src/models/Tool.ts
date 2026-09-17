import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITool extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  displayName: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  requiredPermissions: string[];
  handler: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ToolSchema = new Schema<ITool>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    parametersSchema: {
      type: Schema.Types.Mixed,
      required: true,
    },
    requiredPermissions: {
      type: [String],
      default: [],
    },
    handler: {
      type: String,
      required: true,
    },
    isSystem: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "tools",
  }
);

export const ToolModel: Model<ITool> =
  mongoose.models.Tool || mongoose.model<ITool>("Tool", ToolSchema);
