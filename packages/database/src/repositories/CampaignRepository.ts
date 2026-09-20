import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { CampaignModel, ICampaign } from "../models/Campaign";
import {
  CampaignContactModel,
  ICampaignContact,
  CampaignCallStatus,
} from "../models/CampaignContact";
import { AgentModel } from "../models/Agent";
import { ContactModel } from "../models/Contact";
import { withTransaction } from "../transactions";

export class CampaignRepository {
  static async findByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: { status?: string }
  ): Promise<ICampaign[]> {
    await connectToDatabase();
    const query: Record<string, unknown> = { organizationId: orgId };
    if (options?.status) query.status = options.status;
    return CampaignModel.find(query)
      .populate("agentId", "name config.voice.voiceId")
      .sort({ createdAt: -1 })
      .exec();
  }

  static async findById(
    campaignId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<ICampaign | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: campaignId };
    if (orgId) query.organizationId = orgId;
    return CampaignModel.findOne(query)
      .populate("agentId")
      .exec();
  }

  static async createCampaignWithContacts(data: {
    organizationId: string | mongoose.Types.ObjectId;
    agentId: string | mongoose.Types.ObjectId;
    name: string;
    contactIds: Array<string | mongoose.Types.ObjectId>;
    concurrencyLimit?: number;
    retryConfig?: {
      maxAttempts: number;
      initialDelaySecs: number;
      backoffMultiplier: number;
    };
  }): Promise<ICampaign> {
    return withTransaction(async (session) => {
      // Verify the agent belongs to this org before creating anything.
      const agent = await AgentModel.findOne({
        _id: data.agentId,
        organizationId: data.organizationId,
      })
        .session(session)
        .exec();
      if (!agent) {
        throw new Error("Agent not found in this organization");
      }

      // Dedupe contactIds so the same contact cannot be dialled twice.
      const uniqueContactIds = [
        ...new Set(data.contactIds.map((cId) => cId.toString())),
      ];

      // Verify every contact belongs to this org.
      if (uniqueContactIds.length > 0) {
        const ownedCount = await ContactModel.countDocuments({
          _id: { $in: uniqueContactIds },
          organizationId: data.organizationId,
        })
          .session(session)
          .exec();
        if (ownedCount !== uniqueContactIds.length) {
          throw new Error("One or more contacts do not belong to this organization");
        }
      }

      const campaign = new CampaignModel({
        organizationId: data.organizationId,
        agentId: data.agentId,
        name: data.name.trim(),
        status: "draft",
        totalContacts: uniqueContactIds.length,
        callsCompleted: 0,
        concurrencyLimit: data.concurrencyLimit ?? 5,
        retryConfig: data.retryConfig ?? {
          maxAttempts: 3,
          initialDelaySecs: 300,
          backoffMultiplier: 2.0,
        },
      });
      await campaign.save({ session });

      if (uniqueContactIds.length > 0) {
        const campaignContacts = uniqueContactIds.map((cId) => ({
          campaignId: campaign._id,
          contactId: cId,
          organizationId: data.organizationId,
          callStatus: "pending" as CampaignCallStatus,
          attemptCount: 0,
        }));
        await CampaignContactModel.insertMany(campaignContacts, { session });
      }

      return campaign;
    });
  }

  static async updateStatus(
    campaignId: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    status: "draft" | "running" | "paused" | "completed" | "cancelled"
  ): Promise<ICampaign | null> {
    await connectToDatabase();
    return CampaignModel.findOneAndUpdate(
      { _id: campaignId, organizationId: orgId },
      { status },
      { returnDocument: "after" }
    ).exec();
  }

  static async getEligibleContacts(
    campaignId: string | mongoose.Types.ObjectId,
    limit = 50,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<ICampaignContact[]> {
    await connectToDatabase();
    const now = new Date();
    const query: Record<string, unknown> = {
      campaignId,
      callStatus: "pending",
      $or: [
        { nextAttemptAt: { $exists: false } },
        { nextAttemptAt: { $lte: now } },
      ],
    };
    if (orgId) query.organizationId = orgId;
    return CampaignContactModel.find(query)
      .populate("contactId")
      .limit(limit)
      .exec();
  }

  static async updateContactStatus(
    campaignId: string | mongoose.Types.ObjectId,
    contactId: string | mongoose.Types.ObjectId,
    status: CampaignCallStatus,
    extra?: {
      attemptCount?: number;
      lastAttemptAt?: Date;
      nextAttemptAt?: Date;
    },
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<ICampaignContact | null> {
    await connectToDatabase();
    const update: Record<string, unknown> = { callStatus: status };
    if (extra?.attemptCount !== undefined) update.attemptCount = extra.attemptCount;
    if (extra?.lastAttemptAt) update.lastAttemptAt = extra.lastAttemptAt;
    if (extra?.nextAttemptAt !== undefined) update.nextAttemptAt = extra.nextAttemptAt;

    const filter: Record<string, unknown> = { campaignId, contactId };
    if (orgId) filter.organizationId = orgId;

    return CampaignContactModel.findOneAndUpdate(
      filter,
      { $set: update },
      { returnDocument: "after", runValidators: true }
    ).exec();
  }

  static async incrementCompletedCalls(
    campaignId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<ICampaign | null> {
    await connectToDatabase();
    if (orgId) {
      return CampaignModel.findOneAndUpdate(
        { _id: campaignId, organizationId: orgId },
        { $inc: { callsCompleted: 1 } },
        { returnDocument: "after", runValidators: true }
      ).exec();
    }
    return CampaignModel.findByIdAndUpdate(
      campaignId,
      { $inc: { callsCompleted: 1 } },
      { returnDocument: "after" }
    ).exec();
  }

  static async checkAndMarkCompletion(
    campaignId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    await connectToDatabase();
    const countFilter: Record<string, unknown> = {
      campaignId,
      callStatus: { $in: ["pending", "queued", "dialing", "ringing", "answered"] },
    };
    if (orgId) countFilter.organizationId = orgId;
    const nonTerminalCount = await CampaignContactModel.countDocuments(countFilter).exec();

    if (nonTerminalCount === 0) {
      if (orgId) {
        await CampaignModel.findOneAndUpdate(
          { _id: campaignId, organizationId: orgId },
          { $set: { status: "completed" } },
          { runValidators: true }
        ).exec();
      } else {
        await CampaignModel.findByIdAndUpdate(campaignId, { status: "completed" }).exec();
      }
      return true;
    }
    return false;
  }
}
