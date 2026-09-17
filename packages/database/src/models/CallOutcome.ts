import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICallOutcome extends Document {
  _id: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  disposition: string;
  leadStatus?: string;
  interestLevel?: "high" | "medium" | "low" | "none";
  requestedCallback?: boolean;
  budget?: string;
  location?: string;
  appointmentDate?: Date;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CallOutcomeSchema = new Schema<ICallOutcome>(
  {
    callId: {
      type: Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      unique: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    disposition: {
      type: String,
      required: true,
      index: true,
    },
    leadStatus: {
      type: String,
      default: "unqualified",
    },
    interestLevel: {
      type: String,
      enum: ["high", "medium", "low", "none"],
      default: "none",
    },
    requestedCallback: {
      type: Boolean,
      default: false,
    },
    budget: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    appointmentDate: {
      type: Date,
    },
    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "call_outcomes",
  }
);

export const CallOutcomeModel: Model<ICallOutcome> =
  mongoose.models.CallOutcome ||
  mongoose.model<ICallOutcome>("CallOutcome", CallOutcomeSchema);
