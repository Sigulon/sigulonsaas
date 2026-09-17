import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDncEntry extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  normalizedPhone: string; // E.164
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DncEntrySchema = new Schema<IDncEntry>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    normalizedPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "dnc_entries",
  }
);

DncEntrySchema.index(
  { organizationId: 1, normalizedPhone: 1 },
  { unique: true }
);

export const DncEntryModel: Model<IDncEntry> =
  mongoose.models.DncEntry ||
  mongoose.model<IDncEntry>("DncEntry", DncEntrySchema);
