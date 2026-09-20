import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { ContactModel, IContact } from "../models/Contact";

export class ContactRepository {
  static async findByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: {
      limit?: number;
      offset?: number;
      search?: string;
      dncOnly?: boolean;
    }
  ): Promise<{ contacts: IContact[]; total: number }> {
    await connectToDatabase();
    const query: Record<string, unknown> = {
      organizationId: orgId,
      status: "active",
    };

    if (options?.dncOnly) {
      query.doNotCall = true;
    }

    if (options?.search) {
      const s = options.search.trim();
      query.$or = [
        { name: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
        { normalizedPhone: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
      ];
    }

    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    const [contacts, total] = await Promise.all([
      ContactModel.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      ContactModel.countDocuments(query).exec(),
    ]);

    return { contacts, total };
  }

  static async findByNormalizedPhone(
    orgId: string | mongoose.Types.ObjectId,
    normalizedPhone: string
  ): Promise<IContact | null> {
    await connectToDatabase();
    return ContactModel.findOne({
      organizationId: orgId,
      normalizedPhone,
    }).exec();
  }

  static async findById(
    contactId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<IContact | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: contactId };
    if (orgId) query.organizationId = orgId;
    return ContactModel.findOne(query).exec();
  }

  static async create(data: {
    organizationId: string | mongoose.Types.ObjectId;
    name?: string;
    phone: string;
    normalizedPhone: string;
    email?: string;
    company?: string;
    customFields?: Record<string, unknown>;
    tags?: string[];
    doNotCall?: boolean;
    source?: string;
  }): Promise<IContact> {
    await connectToDatabase();
    const contact = new ContactModel({
      organizationId: data.organizationId,
      name: data.name || "",
      phone: data.phone,
      normalizedPhone: data.normalizedPhone,
      email: data.email || "",
      company: data.company || "",
      customFields: data.customFields || {},
      tags: data.tags || [],
      doNotCall: data.doNotCall || false,
      source: data.source || "manual",
    });
    return contact.save();
  }

  static async bulkUpsert(
    orgId: string | mongoose.Types.ObjectId,
    contacts: Array<{
      name?: string;
      phone: string;
      normalizedPhone: string;
      email?: string;
      company?: string;
      customFields?: Record<string, unknown>;
      tags?: string[];
    }>
  ): Promise<IContact[]> {
    await connectToDatabase();
    const results: IContact[] = [];

    for (const c of contacts) {
      const res = await ContactModel.findOneAndUpdate(
        {
          organizationId: orgId,
          normalizedPhone: c.normalizedPhone,
        },
        {
          $set: {
            phone: c.phone,
          },
          $setOnInsert: {
            name: c.name || "",
            email: c.email || "",
            company: c.company || "",
            customFields: c.customFields || {},
            tags: c.tags || [],
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
          runValidators: true,
        }
      ).exec();
      if (res) results.push(res);
    }

    return results;
  }

  static async updateDnc(
    orgId: string | mongoose.Types.ObjectId,
    contactId: string | mongoose.Types.ObjectId,
    doNotCall: boolean
  ): Promise<IContact | null> {
    await connectToDatabase();
    return ContactModel.findOneAndUpdate(
      { _id: contactId, organizationId: orgId },
      { doNotCall },
      { returnDocument: "after" }
    ).exec();
  }
}
