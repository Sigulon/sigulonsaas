import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { PhoneNumberModel, IPhoneNumber } from "../models/PhoneNumber";

export class PhoneNumberRepository {
  /** Minimal assignment rows for the agent list; avoids populate and wide documents. */
  static async findAssignmentsByOrg(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<IPhoneNumber[]> {
    await connectToDatabase();
    return PhoneNumberModel.find({ organizationId: orgId, status: "active" })
      .select("_id agentId phoneNumber direction")
      .sort({ createdAt: -1 })
      .lean<IPhoneNumber[]>()
      .exec();
  }

  static async findByOrg(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<IPhoneNumber[]> {
    await connectToDatabase();
    return PhoneNumberModel.find({ organizationId: orgId, status: "active" })
      .populate("agentId", "name")
      .sort({ createdAt: -1 })
      .exec();
  }

  static async findByNumber(
    phoneNumber: string
  ): Promise<IPhoneNumber | null> {
    await connectToDatabase();
    return PhoneNumberModel.findOne({ phoneNumber, status: "active" })
      .populate("agentId")
      .exec();
  }

  static async findById(
    id: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<IPhoneNumber | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: id };
    if (orgId) query.organizationId = orgId;
    return PhoneNumberModel.findOne(query).exec();
  }

  static async getOutboundNumber(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<IPhoneNumber | null> {
    await connectToDatabase();
    return PhoneNumberModel.findOne({
      organizationId: orgId,
      direction: { $in: ["outbound", "both"] },
      status: "active",
    })
      .sort({ provider: -1 }) // plivo preferred
      .exec();
  }

  static async assignAgent(
    id: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    agentId?: string | mongoose.Types.ObjectId | null
  ): Promise<IPhoneNumber | null> {
    await connectToDatabase();
    return PhoneNumberModel.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { agentId: agentId || null },
      { returnDocument: "after" }
    ).exec();
  }

  static async create(data: {
    organizationId: string | mongoose.Types.ObjectId;
    phoneNumber: string;
    countryCode?: string;
    provider?: string;
    providerNumberId?: string;
    capabilities?: string[];
    direction?: "inbound" | "outbound" | "both";
    agentId?: string | mongoose.Types.ObjectId;
  }): Promise<IPhoneNumber> {
    await connectToDatabase();
    const number = new PhoneNumberModel({
      organizationId: data.organizationId,
      phoneNumber: data.phoneNumber,
      countryCode: data.countryCode || "+91",
      provider: data.provider || "plivo",
      providerNumberId: data.providerNumberId || "",
      capabilities: data.capabilities || ["inbound", "outbound"],
      direction: data.direction || "both",
      agentId: data.agentId,
      status: "active",
    });
    return number.save();
  }

  static async update(
    id: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    data: Partial<{
      agentId: string | mongoose.Types.ObjectId | null;
      direction: "inbound" | "outbound" | "both";
      status: "active" | "released" | "pending";
    }>
  ): Promise<IPhoneNumber | null> {
    await connectToDatabase();
    return PhoneNumberModel.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: data },
      { returnDocument: "after" }
    )
      .populate("agentId", "name")
      .exec();
  }

  static async delete(
    id: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    await connectToDatabase();
    const res = await PhoneNumberModel.deleteOne({ _id: id, organizationId: orgId }).exec();
    return res.deletedCount > 0;
  }
}
