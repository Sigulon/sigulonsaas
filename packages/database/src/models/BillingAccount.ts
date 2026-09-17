import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBillingAccount extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  balanceCredits: number;
  reservedCredits: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillingAccountSchema = new Schema<IBillingAccount>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    balanceCredits: {
      type: Number,
      default: 0,
    },
    reservedCredits: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
  },
  {
    timestamps: true,
    collection: "billing_accounts",
  }
);

export const BillingAccountModel: Model<IBillingAccount> =
  mongoose.models.BillingAccount ||
  mongoose.model<IBillingAccount>("BillingAccount", BillingAccountSchema);
