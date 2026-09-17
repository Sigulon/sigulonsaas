import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserSession extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSessionSchema = new Schema<IUserSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index for automatic expiry
    },
    revokedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "user_sessions",
  }
);

export const UserSessionModel: Model<IUserSession> =
  mongoose.models.UserSession ||
  mongoose.model<IUserSession>("UserSession", UserSessionSchema);
