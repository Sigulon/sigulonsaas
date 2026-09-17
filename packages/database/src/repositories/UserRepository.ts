import mongoose from "mongoose";
import crypto from "crypto";
import { connectToDatabase } from "../client";
import { UserModel, IUser } from "../models/User";
import { UserSessionModel, IUserSession } from "../models/UserSession";

export class UserRepository {
  private static hashResetToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
  static async findByEmail(email: string): Promise<IUser | null> {
    await connectToDatabase();
    return UserModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  static async findById(id: string | mongoose.Types.ObjectId): Promise<IUser | null> {
    await connectToDatabase();
    return UserModel.findById(id).exec();
  }

  static async create(userData: {
    email: string;
    passwordHash: string;
    name?: string;
    avatarUrl?: string;
    status?: "active" | "suspended" | "pending";
    emailVerified?: boolean;
    verificationToken?: string;
  }): Promise<IUser> {
    await connectToDatabase();
    const user = new UserModel({
      email: userData.email.toLowerCase().trim(),
      passwordHash: userData.passwordHash,
      name: userData.name || "",
      avatarUrl: userData.avatarUrl || "",
      status: userData.status || "active",
      emailVerified: userData.emailVerified || false,
      verificationToken: userData.verificationToken,
    });
    return user.save();
  }

  static async updateLastLogin(id: string | mongoose.Types.ObjectId): Promise<void> {
    await connectToDatabase();
    await UserModel.findByIdAndUpdate(id, { lastLoginAt: new Date() }).exec();
  }

  static async setPasswordResetToken(
    email: string,
    token: string,
    expiresAt: Date
  ): Promise<boolean> {
    await connectToDatabase();
    const res = await UserModel.updateOne(
      { email: email.toLowerCase().trim() },
      {
        resetPasswordToken: this.hashResetToken(token),
        resetPasswordExpires: expiresAt,
      }
    ).exec();
    return res.modifiedCount > 0;
  }

  static async resetPassword(token: string, newPasswordHash: string): Promise<IUser | null> {
    await connectToDatabase();
    const user = await UserModel.findOne({
      resetPasswordToken: this.hashResetToken(token),
      resetPasswordExpires: { $gt: new Date() },
    }).exec();

    if (!user) return null;

    user.passwordHash = newPasswordHash;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    return user.save();
  }

  static async clearPasswordResetToken(email: string): Promise<void> {
    await connectToDatabase();
    await UserModel.updateOne(
      { email: email.toLowerCase().trim() },
      { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
    ).exec();
  }

  static async verifyEmail(token: string): Promise<boolean> {
    await connectToDatabase();
    const res = await UserModel.updateOne(
      { verificationToken: token },
      {
        emailVerified: true,
        verificationToken: undefined,
      }
    ).exec();
    return res.modifiedCount > 0;
  }

  // Session Operations
  static async createSession(data: {
    userId: string | mongoose.Types.ObjectId;
    token: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<IUserSession> {
    await connectToDatabase();
    const session = new UserSessionModel({
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
      userAgent: data.userAgent || "",
      ipAddress: data.ipAddress || "",
    });
    return session.save();
  }

  static async findSession(token: string): Promise<IUserSession | null> {
    await connectToDatabase();
    return UserSessionModel.findOne({
      token,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .populate("userId")
      .exec();
  }

  static async revokeSession(token: string): Promise<void> {
    await connectToDatabase();
    await UserSessionModel.updateOne(
      { token },
      { revokedAt: new Date() }
    ).exec();
  }

  static async revokeAllUserSessions(userId: string | mongoose.Types.ObjectId): Promise<void> {
    await connectToDatabase();
    await UserSessionModel.updateMany(
      { userId, revokedAt: { $exists: false } },
      { revokedAt: new Date() }
    ).exec();
  }
}
