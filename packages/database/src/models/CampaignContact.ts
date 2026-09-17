import mongoose, { Schema, Document, Model } from "mongoose";

export type CampaignCallStatus =
  | "pending"
  | "queued"
  | "dialing"
  | "ringing"
  | "answered"
  | "completed"
  | "failed"
  | "busy"
  | "no_answer"
  | "skipped"
  | "dnc";

export interface ICampaignContact extends Document {
  _id: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  callStatus: CampaignCallStatus;
  attemptCount: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignContactSchema = new Schema<ICampaignContact>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    callStatus: {
      type: String,
      enum: [
        "pending",
        "queued",
        "dialing",
        "ringing",
        "answered",
        "completed",
        "failed",
        "busy",
        "no_answer",
        "skipped",
        "dnc",
      ],
      default: "pending",
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    nextAttemptAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "campaign_contacts",
  }
);

CampaignContactSchema.index(
  { campaignId: 1, contactId: 1 },
  { unique: true }
);

CampaignContactSchema.index({
  campaignId: 1,
  callStatus: 1,
  nextAttemptAt: 1,
});

export const CampaignContactModel: Model<ICampaignContact> =
  mongoose.models.CampaignContact ||
  mongoose.model<ICampaignContact>(
    "CampaignContact",
    CampaignContactSchema
  );
