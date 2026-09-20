import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { OrganizationModel, IOrganization } from "../models/Organization";
import {
  OrganizationMemberModel,
  IOrganizationMember,
  OrgRole,
} from "../models/OrganizationMember";
import { withTransaction } from "../transactions";

export class OrganizationRepository {
  static async findById(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<IOrganization | null> {
    await connectToDatabase();
    return OrganizationModel.findById(orgId).exec();
  }

  static async findUserMemberships(
    userId: string | mongoose.Types.ObjectId
  ): Promise<Array<{ organization: IOrganization; role: OrgRole }>> {
    await connectToDatabase();
    const members = await OrganizationMemberModel.find({ userId })
      .populate<{ organizationId: IOrganization }>("organizationId")
      .exec();

    return members
      .filter((m) => m.organizationId != null)
      .map((m) => ({
        organization: m.organizationId,
        role: m.role,
      }));
  }

  static async getMember(
    orgId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IOrganizationMember | null> {
    await connectToDatabase();
    return OrganizationMemberModel.findOne({
      organizationId: orgId,
      userId,
    }).exec();
  }

  static async createOrganizationWithMember(data: {
    name: string;
    userId: string | mongoose.Types.ObjectId;
    maxConcurrentCalls?: number;
    timezone?: string;
  }): Promise<{ organization: IOrganization; member: IOrganizationMember }> {
    return withTransaction(async (session) => {
      const org = new OrganizationModel({
        name: data.name.trim(),
        maxConcurrentCalls: data.maxConcurrentCalls ?? 5,
        timezone: data.timezone ?? "Asia/Kolkata",
      });
      await org.save({ session });

      const member = new OrganizationMemberModel({
        organizationId: org._id,
        userId: data.userId,
        role: "owner",
      });
      await member.save({ session });

      return { organization: org, member };
    });
  }

  static async listMembers(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<
    Array<{
      id: string;
      userId: string;
      email: string;
      name: string;
      role: OrgRole;
      createdAt: Date;
    }>
  > {
    await connectToDatabase();
    const members = await OrganizationMemberModel.find({ organizationId: orgId })
      .populate<{ userId: { _id: mongoose.Types.ObjectId; email: string; name: string } }>(
        "userId",
        "email name"
      )
      .exec();

    return members
      .filter((m) => m.userId != null)
      .map((m) => ({
        id: m._id.toString(),
        userId: m.userId._id.toString(),
        email: m.userId.email,
        name: m.userId.name,
        role: m.role,
        createdAt: m.createdAt,
      }));
  }

  static async addMember(data: {
    organizationId: string | mongoose.Types.ObjectId;
    userId: string | mongoose.Types.ObjectId;
    role: OrgRole;
  }): Promise<IOrganizationMember> {
    await connectToDatabase();
    return OrganizationMemberModel.findOneAndUpdate(
      { organizationId: data.organizationId, userId: data.userId },
      { $set: { role: data.role } },
      { upsert: true, returnDocument: "after", runValidators: true }
    ).exec() as Promise<IOrganizationMember>;
  }

  static async removeMember(
    orgId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    await connectToDatabase();
    const res = await OrganizationMemberModel.deleteOne({
      organizationId: orgId,
      userId,
    }).exec();
    return res.deletedCount > 0;
  }

  static async countOwners(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<number> {
    await connectToDatabase();
    return OrganizationMemberModel.countDocuments({
      organizationId: orgId,
      role: "owner",
    }).exec();
  }
}
