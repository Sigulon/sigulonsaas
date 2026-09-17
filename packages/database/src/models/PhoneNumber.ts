import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPhoneNumber extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  phoneNumber: string; // E.164
  countryCode: string;
  provider: string; // plivo
  providerNumberId?: string;
  capabilities: string[];
  direction: "inbound" | "outbound" | "both";
  status: "active" | "released" | "pending";
  createdAt: Date;
  updatedAt: Date;
}

const PhoneNumberSchema = new Schema<IPhoneNumber>(
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
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    countryCode: {
      type: String,
      default: "+91",
    },
    provider: {
      type: String,
      default: "plivo",
      index: true,
    },
    providerNumberId: {
      type: String,
      default: "",
    },
    capabilities: {
      type: [String],
      default: ["inbound", "outbound"],
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound", "both"],
      default: "both",
    },
    status: {
      type: String,
      enum: ["active", "released", "pending"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "phone_numbers",
  }
);

PhoneNumberSchema.index(
  { organizationId: 1, phoneNumber: 1 },
  { unique: true }
);
PhoneNumberSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const PhoneNumberModel: Model<IPhoneNumber> =
  mongoose.models.PhoneNumber ||
  mongoose.model<IPhoneNumber>("PhoneNumber", PhoneNumberSchema);
