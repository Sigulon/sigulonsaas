import mongoose, { Schema, Document, Model } from "mongoose";
import { OrgRole } from "./OrganizationMember";

export interface ITeamInvite extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  email: string;
  role: OrgRole;
  token: string;
  invitedBy: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TeamInviteSchema = new Schema<ITeamInvite>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      default: "member",
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired", "revoked"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "team_invites",
  }
);

TeamInviteSchema.index(
  { organizationId: 1, email: 1, status: 1 }
);

// One pending invite per org+email: a re-invite upserts instead of stacking
// duplicate pending rows.
TeamInviteSchema.index(
  { organizationId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export const TeamInviteModel: Model<ITeamInvite> =
  mongoose.models.TeamInvite ||
  mongoose.model<ITeamInvite>("TeamInvite", TeamInviteSchema);
