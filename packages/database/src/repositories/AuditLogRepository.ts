import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { AuditLogModel, IAuditLog } from "../models/AuditLog";

export class AuditLogRepository {
  static async log(data: {
    organizationId?: string | mongoose.Types.ObjectId;
    userId?: string | mongoose.Types.ObjectId;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }): Promise<IAuditLog> {
    await connectToDatabase();
    const entry = new AuditLogModel({
      organizationId: data.organizationId,
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress || "",
      userAgent: data.userAgent || "",
      details: data.details || {},
      createdAt: new Date(),
    });
    return entry.save();
  }

  static async listByOrg(
    orgId: string | mongoose.Types.ObjectId,
    limit = 50
  ): Promise<IAuditLog[]> {
    await connectToDatabase();
    return AuditLogModel.find({ organizationId: orgId })
      .populate("userId", "email name")
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
