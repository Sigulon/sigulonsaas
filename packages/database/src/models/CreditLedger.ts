import mongoose, { Schema, Document, Model } from "mongoose";

export type CreditEventType =
  | "credit_purchase"
  | "credit_grant"
  | "call_reservation"
  | "call_usage"
  | "call_refund"
  | "adjustment";

export interface ICreditLedger extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  type: CreditEventType;
  amount: number;
  balanceAfter: number;
  referenceType?: string; // "call" | "payment" | "admin"
  referenceId?: string; // callId or paymentId
  idempotencyKey?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const CreditLedgerSchema = new Schema<ICreditLedger>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "credit_purchase",
        "credit_grant",
        "call_reservation",
        "call_usage",
        "call_refund",
        "adjustment",
      ],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    referenceType: {
      type: String,
      default: "call",
    },
    referenceId: {
      type: String,
      index: true,
    },
    idempotencyKey: {
      type: String,
      index: true,
      sparse: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "credit_ledger",
  }
);

CreditLedgerSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);

CreditLedgerSchema.index({ organizationId: 1, createdAt: -1 });

export const CreditLedgerModel: Model<ICreditLedger> =
  mongoose.models.CreditLedger ||
  mongoose.model<ICreditLedger>("CreditLedger", CreditLedgerSchema);
