import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWebhookEvent extends Document {
  _id: mongoose.Types.ObjectId;
  provider: string; // "plivo" | "cartesia" | etc.
  eventId: string;
  eventType: string;
  payloadHash: string;
  status: "received" | "processed" | "ignored" | "failed";
  error?: string;
  receivedAt: Date;
  processedAt?: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: {
      type: String,
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    payloadHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["received", "processed", "ignored", "failed"],
      default: "received",
      index: true,
    },
    error: {
      type: String,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: false,
    collection: "webhook_events",
  }
);

WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEventModel: Model<IWebhookEvent> =
  mongoose.models.WebhookEvent ||
  mongoose.model<IWebhookEvent>("WebhookEvent", WebhookEventSchema);
