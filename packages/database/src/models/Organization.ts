import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOrganization extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug?: string;
  maxConcurrentCalls: number;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    maxConcurrentCalls: {
      type: Number,
      default: 5,
      min: 1,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    settings: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "organizations",
  }
);

export const OrganizationModel: Model<IOrganization> =
  mongoose.models.Organization ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);
