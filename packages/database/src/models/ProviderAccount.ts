import mongoose, { Schema, Document, Model } from "mongoose";

export interface IProviderAccount extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  provider: string; // "cartesia" | "plivo" | "openrouter"
  credentialsEncrypted: string;
  encryptionIv: string;
  status: "active" | "error" | "revoked";
  createdAt: Date;
  updatedAt: Date;
}

const ProviderAccountSchema = new Schema<IProviderAccount>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      index: true,
    },
    credentialsEncrypted: {
      type: String,
      required: true,
    },
    encryptionIv: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "error", "revoked"],
      default: "active",
    },
  },
  {
    timestamps: true,
    collection: "provider_accounts",
  }
);

ProviderAccountSchema.index(
  { organizationId: 1, provider: 1 },
  { unique: true }
);

export const ProviderAccountModel: Model<IProviderAccount> =
  mongoose.models.ProviderAccount ||
  mongoose.model<IProviderAccount>("ProviderAccount", ProviderAccountSchema);
