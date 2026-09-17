import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContact extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  name?: string;
  phone: string;
  normalizedPhone: string; // E.164 canonical
  email?: string;
  company?: string;
  customFields: Record<string, unknown>;
  tags: string[];
  doNotCall: boolean;
  source: string;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    company: {
      type: String,
      trim: true,
      default: "",
    },
    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },
    tags: {
      type: [String],
      default: [],
    },
    doNotCall: {
      type: Boolean,
      default: false,
      index: true,
    },
    source: {
      type: String,
      default: "manual",
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "contacts",
  }
);

ContactSchema.index(
  { organizationId: 1, normalizedPhone: 1 },
  { unique: true }
);

export const ContactModel: Model<IContact> =
  mongoose.models.Contact ||
  mongoose.model<IContact>("Contact", ContactSchema);
