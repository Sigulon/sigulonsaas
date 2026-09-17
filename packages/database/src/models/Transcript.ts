import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITranscriptSegment {
  speaker: "agent" | "user" | "system";
  startMs?: number;
  endMs?: number;
  text: string;
  confidence?: number;
}

export interface ITranscript extends Document {
  _id: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  segments: ITranscriptSegment[];
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptSegmentSchema = new Schema<ITranscriptSegment>(
  {
    speaker: {
      type: String,
      enum: ["agent", "user", "system"],
      required: true,
    },
    startMs: { type: Number },
    endMs: { type: Number },
    text: { type: String, required: true },
    confidence: { type: Number },
  },
  { _id: false }
);

const TranscriptSchema = new Schema<ITranscript>(
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
    segments: {
      type: [TranscriptSegmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "transcripts",
  }
);

export const TranscriptModel: Model<ITranscript> =
  mongoose.models.Transcript ||
  mongoose.model<ITranscript>("Transcript", TranscriptSchema);
