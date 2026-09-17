import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICallEvent extends Document {
  _id: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  type: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
  timestamp: Date;
  createdAt: Date;
}

const CallEventSchema = new Schema<ICallEvent>(
  {
    callId: {
      type: Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      index: true,
      sparse: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "call_events",
  }
);

CallEventSchema.index(
  { callId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);

export const CallEventModel: Model<ICallEvent> =
  mongoose.models.CallEvent ||
  mongoose.model<ICallEvent>("CallEvent", CallEventSchema);
