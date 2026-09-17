import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { CampaignModel, ICampaign } from "../models/Campaign";
import {
  CampaignContactModel,
  ICampaignContact,
  CampaignCallStatus,
} from "../models/CampaignContact";
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
      const campaign = new CampaignModel({
        organizationId: data.organizationId,
        agentId: data.agentId,
        name: data.name.trim(),
        status: "draft",
        totalContacts: data.contactIds.length,
        callsCompleted: 0,
        concurrencyLimit: data.concurrencyLimit ?? 5,
        retryConfig: data.retryConfig ?? {
          maxAttempts: 3,
          initialDelaySecs: 300,
          backoffMultiplier: 2.0,
        },
      });
      await campaign.save({ session });

      if (data.contactIds.length > 0) {
        const campaignContacts = data.contactIds.map((cId) => ({
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
    limit = 50
  ): Promise<ICampaignContact[]> {
    await connectToDatabase();
    const now = new Date();
    return CampaignContactModel.find({
      campaignId,
      callStatus: "pending",
      $or: [
        { nextAttemptAt: { $exists: false } },
        { nextAttemptAt: { $lte: now } },
      ],
    })
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
    }
  ): Promise<ICampaignContact | null> {
    await connectToDatabase();
    const update: Record<string, unknown> = { callStatus: status };
    if (extra?.attemptCount !== undefined) update.attemptCount = extra.attemptCount;
    if (extra?.lastAttemptAt) update.lastAttemptAt = extra.lastAttemptAt;
    if (extra?.nextAttemptAt !== undefined) update.nextAttemptAt = extra.nextAttemptAt;

    return CampaignContactModel.findOneAndUpdate(
      { campaignId, contactId },
      { $set: update },
      { returnDocument: "after" }
    ).exec();
  }

  static async incrementCompletedCalls(
    campaignId: string | mongoose.Types.ObjectId
  ): Promise<ICampaign | null> {
    await connectToDatabase();
    return CampaignModel.findByIdAndUpdate(
      campaignId,
      { $inc: { callsCompleted: 1 } },
      { returnDocument: "after" }
    ).exec();
  }

  static async checkAndMarkCompletion(
    campaignId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    await connectToDatabase();
    const nonTerminalCount = await CampaignContactModel.countDocuments({
      campaignId,
      callStatus: { $in: ["pending", "queued", "dialing", "ringing", "answered"] },
    }).exec();

    if (nonTerminalCount === 0) {
      await CampaignModel.findByIdAndUpdate(campaignId, { status: "completed" }).exec();
      return true;
    }
    return false;
  }
}
