import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { DncEntryModel, IDncEntry } from "../models/DncEntry";

export class DncRepository {
  static async isDnc(
    orgId: string | mongoose.Types.ObjectId,
    normalizedPhone: string
  ): Promise<boolean> {
    await connectToDatabase();
    const count = await DncEntryModel.countDocuments({
      organizationId: orgId,
      normalizedPhone,
    }).exec();
    return count > 0;
  }

  static async listByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: { limit?: number; offset?: number }
  ): Promise<{ entries: IDncEntry[]; total: number }> {
    await connectToDatabase();
    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    const [entries, total] = await Promise.all([
      DncEntryModel.find({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      DncEntryModel.countDocuments({ organizationId: orgId }).exec(),
    ]);

    return { entries, total };
  }

  static async add(
    orgId: string | mongoose.Types.ObjectId,
    normalizedPhone: string,
    reason?: string
  ): Promise<IDncEntry> {
    await connectToDatabase();
    // Normalize the value so "+91 98765 43210" and "+919876543210" hit the
    // same unique row instead of creating duplicates.
    const digits = (normalizedPhone || "").replace(/\D/g, "");
    const normalized = normalizedPhone.trim().startsWith("+") && digits
      ? `+${digits}`
      : normalizedPhone.trim();
    return DncEntryModel.findOneAndUpdate(
      { organizationId: orgId, normalizedPhone: normalized },
      { $set: { reason: reason || "" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true }
    ).exec() as Promise<IDncEntry>;
  }

  static async remove(
    orgId: string | mongoose.Types.ObjectId,
    normalizedPhone: string
  ): Promise<boolean> {
    await connectToDatabase();
    const res = await DncEntryModel.deleteOne({
      organizationId: orgId,
      normalizedPhone,
    }).exec();
    return res.deletedCount > 0;
  }
}
