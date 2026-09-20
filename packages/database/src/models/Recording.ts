import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRecording extends Document {
  _id: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  storageProvider: string; // "gcs" | "s3" | "spaces"
  bucket: string;
  objectKey: string;
  durationSeconds?: number;
  format: string; // "audio/ogg" | "audio/wav" | "audio/mp3"
  sizeBytes?: number;
  status: "uploading" | "ready" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const RecordingSchema = new Schema<IRecording>(
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
    storageProvider: {
      type: String,
      default: "gcs",
    },
    bucket: {
      type: String,
      required: true,
    },
    objectKey: {
      type: String,
      required: true,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    format: {
      type: String,
      default: "audio/ogg",
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["uploading", "ready", "failed"],
      default: "ready",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "recordings",
  }
);

RecordingSchema.index({ callId: 1 }, { unique: true });

export const RecordingModel: Model<IRecording> =
  mongoose.models.Recording ||
  mongoose.model<IRecording>("Recording", RecordingSchema);
