import mongoose, { Schema, Document, Model } from "mongoose";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface IOrganizationMember extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: OrgRole;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationMemberSchema = new Schema<IOrganizationMember>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      default: "member",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "organization_members",
  }
);

OrganizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true }
);

export const OrganizationMemberModel: Model<IOrganizationMember> =
  mongoose.models.OrganizationMember ||
  mongoose.model<IOrganizationMember>(
    "OrganizationMember",
    OrganizationMemberSchema
  );
