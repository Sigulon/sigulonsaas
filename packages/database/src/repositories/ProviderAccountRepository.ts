import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { ProviderAccountModel, IProviderAccount } from "../models/ProviderAccount";

export class ProviderAccountRepository {
  static async findByOrgAndProvider(
    orgId: string | mongoose.Types.ObjectId,
    provider: string
  ): Promise<IProviderAccount | null> {
    await connectToDatabase();
    return ProviderAccountModel.findOne({ organizationId: orgId, provider }).exec();
  }

  static async upsert(
    orgId: string | mongoose.Types.ObjectId,
    provider: string,
    credentialsEncrypted: string,
    encryptionIv: string,
    status: "active" | "error" | "revoked" = "active"
  ): Promise<IProviderAccount> {
    await connectToDatabase();
    return ProviderAccountModel.findOneAndUpdate(
      { organizationId: orgId, provider },
      {
        credentialsEncrypted,
        encryptionIv,
        status,
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).exec() as Promise<IProviderAccount>;
  }

  static async delete(
    orgId: string | mongoose.Types.ObjectId,
    provider: string
  ): Promise<boolean> {
    await connectToDatabase();
    const res = await ProviderAccountModel.deleteOne({ organizationId: orgId, provider }).exec();
    return res.deletedCount > 0;
  }
}
