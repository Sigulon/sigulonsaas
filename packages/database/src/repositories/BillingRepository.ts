import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { BillingAccountModel, IBillingAccount } from "../models/BillingAccount";
import { CreditLedgerModel, ICreditLedger } from "../models/CreditLedger";
import { UsageRecordModel } from "../models/UsageRecord";
import { CallModel } from "../models/Call";
import { withTransaction } from "../transactions";

export interface CreditState {
  balance: number;
  reserved: number;
  available: number;
}

/**
 * `balanceCredits` is the spendable balance after an active hold has already
 * been deducted. `reservedCredits` is tracked separately for reporting and
 * settlement, so subtracting it a second time understates availability.
 */
function stateOf(account: IBillingAccount): CreditState {
  const balance = Math.round(account.balanceCredits * 100) / 100;
  const reserved = Math.round(account.reservedCredits * 100) / 100;
  return { balance, reserved, available: balance };
}

export class BillingRepository {
  static async ensureAccount(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<IBillingAccount> {
    await connectToDatabase();
    const account = await BillingAccountModel.findOneAndUpdate(
      { organizationId: orgId },
      {
        $setOnInsert: {
          organizationId: orgId,
          balanceCredits: 0,
          reservedCredits: 0,
          currency: "INR",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
    if (!account) {
      throw new Error("Failed to ensure billing account");
    }
    return account;
  }

  static async getState(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<CreditState> {
    const account = await this.ensureAccount(orgId);
    return stateOf(account);
  }

  /**
   * Reserve credits at ANSWERED inside an atomic MongoDB transaction.
   * Idempotent per call via idempotencyKey "reserve:{callId}".
   * Postpaid-grace policy: if available balance is low, still reserves and flags insufficient.
   */
  static async reserveCallCredits(data: {
    organizationId: string | mongoose.Types.ObjectId;
    callId: string | mongoose.Types.ObjectId;
    estimate: number;
  }): Promise<CreditState & { didReserve: boolean; insufficient: boolean }> {
    const orgId = data.organizationId;
    const callIdStr = data.callId.toString();
    const idempotencyKey = `reserve:${callIdStr}`;

    return withTransaction(async (session) => {
      // 1. Idempotency mutex check
      const existingLedger = await CreditLedgerModel.findOne({
        organizationId: orgId,
        idempotencyKey,
      }).session(session);

      let account = await BillingAccountModel.findOne({
        organizationId: orgId,
      }).session(session);

      if (!account) {
        account = new BillingAccountModel({
          organizationId: orgId,
          balanceCredits: 0,
          reservedCredits: 0,
        });
        await account.save({ session });
      }

      if (existingLedger) {
        // Redelivery: balances already moved
        return {
          ...stateOf(account),
          didReserve: false,
          insufficient: false,
        };
      }

      // Settlement can arrive before the runtime's asynchronous reservation
      // ping. A late hold after settlement would strand credits forever, so
      // the durable settle ledger is the ordering barrier.
      const existingSettlement = await CreditLedgerModel.findOne({
        organizationId: orgId,
        idempotencyKey: `settle:${callIdStr}`,
      }).session(session);
      if (existingSettlement) {
        return {
          ...stateOf(account),
          didReserve: false,
          insufficient: false,
        };
      }

      const insufficient = account.balanceCredits < data.estimate;

      // Deduct estimate from balance and add to reserved hold
      account.balanceCredits =
        Math.round((account.balanceCredits - data.estimate) * 100) / 100;
      account.reservedCredits =
        Math.round((account.reservedCredits + data.estimate) * 100) / 100;
      await account.save({ session });

      const ledger = new CreditLedgerModel({
        organizationId: orgId,
        type: "call_reservation",
        amount: data.estimate,
        balanceAfter: account.balanceCredits,
        referenceType: "call",
        referenceId: callIdStr,
        idempotencyKey,
        metadata: { estimateCredits: data.estimate, insufficient },
      });
      await ledger.save({ session });

      return {
        ...stateOf(account),
        didReserve: true,
        insufficient,
      };
    });
  }

  /**
   * Settle actual usage at COMPLETED inside an atomic MongoDB transaction.
   * If usage is 0 (e.g. failed/busy leg), releases the hold without debit.
   * Idempotent per call via idempotencyKey "settle:{callId}".
   */
  static async settleCallCredits(data: {
    organizationId: string | mongoose.Types.ObjectId;
    callId: string | mongoose.Types.ObjectId;
    usageCredits: number;
    breakdown?: {
      durationSeconds?: number;
      sttCost?: number;
      llmCost?: number;
      ttsCost?: number;
      telephonyCost?: number;
      platformMarkup?: number;
    };
  }): Promise<
    CreditState & { settled: boolean; usage: number; refunded: number }
  > {
    const orgId = data.organizationId;
    const callIdStr = data.callId.toString();
    const idempotencyKey = `settle:${callIdStr}`;
    const usage = Math.round(Math.abs(data.usageCredits) * 100) / 100;

    return withTransaction(async (session) => {
      let account = await BillingAccountModel.findOne({
        organizationId: orgId,
      }).session(session);

      if (!account) {
        account = new BillingAccountModel({
          organizationId: orgId,
          balanceCredits: 0,
          reservedCredits: 0,
        });
        await account.save({ session });
      }

      // 1. Idempotency mutex check
      const existingSettle = await CreditLedgerModel.findOne({
        organizationId: orgId,
        idempotencyKey,
      }).session(session);

      if (existingSettle) {
        // Redelivery
        return {
          ...stateOf(account),
          settled: false,
          usage,
          refunded: 0,
        };
      }

      // Find original reservation hold
      const reservation = await CreditLedgerModel.findOne({
        organizationId: orgId,
        idempotencyKey: `reserve:${callIdStr}`,
      }).session(session);

      const estimate = reservation ? reservation.amount : 0;
      const refund = Math.max(0, Math.round((estimate - usage) * 100) / 100);

      // Adjust account: release reserved hold, credit back the refund difference
      account.reservedCredits = Math.max(
        0,
        Math.round((account.reservedCredits - estimate) * 100) / 100
      );
      account.balanceCredits =
        Math.round((account.balanceCredits + (estimate - usage)) * 100) / 100;
      await account.save({ session });

      // Record immutable ledger entry for actual usage
      const ledger = new CreditLedgerModel({
        organizationId: orgId,
        type: "call_usage",
        amount: -usage,
        balanceAfter: account.balanceCredits,
        referenceType: "call",
        referenceId: callIdStr,
        idempotencyKey,
        metadata: { usageCredits: usage, refundedCredits: refund },
      });
      await ledger.save({ session });

      // Stamp call cost
      await CallModel.findOneAndUpdate(
        { _id: data.callId, organizationId: orgId },
        { $set: { costCredits: usage } },
        { session }
      );

      // Create usage breakdown record if provided
      if (data.breakdown) {
        const usageRecord = new UsageRecordModel({
          organizationId: orgId,
          callId: data.callId,
          durationSeconds: data.breakdown.durationSeconds || 0,
          sttCost: data.breakdown.sttCost || 0,
          llmCost: data.breakdown.llmCost || 0,
          ttsCost: data.breakdown.ttsCost || 0,
          telephonyCost: data.breakdown.telephonyCost || 0,
          platformMarkup: data.breakdown.platformMarkup || 0,
          totalCredits: usage,
        });
        await usageRecord.save({ session });
      }

      return {
        ...stateOf(account),
        settled: true,
        usage,
        refunded: refund,
      };
    });
  }

  /**
   * Grant or purchase credits atomically.
   */
  static async grantCredits(data: {
    organizationId: string | mongoose.Types.ObjectId;
    amount: number;
    type?: "credit_purchase" | "credit_grant" | "adjustment";
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreditState> {
    const orgId = data.organizationId;
    const raw = Number(data.amount);
    if (!Number.isFinite(raw)) {
      throw new Error("grantCredits amount must be a finite number");
    }
    const amount = Math.round(raw * 100) / 100;
    if (amount === 0) {
      throw new Error("grantCredits amount must be non-zero");
    }

    return withTransaction(async (session) => {
      let account = await BillingAccountModel.findOne({
        organizationId: orgId,
      }).session(session);

      if (!account) {
        account = new BillingAccountModel({
          organizationId: orgId,
          balanceCredits: 0,
          reservedCredits: 0,
        });
      }

      if (data.idempotencyKey) {
        const existing = await CreditLedgerModel.findOne({
          organizationId: orgId,
          idempotencyKey: data.idempotencyKey,
        }).session(session);
        if (existing) {
          return {
            ...stateOf(account),
          };
        }
      }

      account.balanceCredits =
        Math.round((account.balanceCredits + amount) * 100) / 100;
      await account.save({ session });

      const ledger = new CreditLedgerModel({
        organizationId: orgId,
        type: data.type || "credit_grant",
        amount,
        balanceAfter: account.balanceCredits,
        referenceType: "admin",
        idempotencyKey: data.idempotencyKey,
        metadata: data.metadata || {},
      });
      await ledger.save({ session });

      return {
        ...stateOf(account),
      };
    });
  }

  static async getSummary(
    orgId: string | mongoose.Types.ObjectId
  ): Promise<{
    balance: number;
    reserved: number;
    available: number;
    spend7d: number;
    history: ICreditLedger[];
  }> {
    await connectToDatabase();
    const state = await this.getState(orgId);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [recentUsage, history] = await Promise.all([
      CreditLedgerModel.find({
        organizationId: orgId,
        type: "call_usage",
        createdAt: { $gte: sevenDaysAgo },
      }).exec(),
      CreditLedgerModel.find({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .limit(20)
        .exec(),
    ]);

    const spend7d = Math.round(
      recentUsage.reduce((acc, row) => acc + Math.abs(row.amount), 0) * 100
    ) / 100;

    return {
      balance: state.balance,
      reserved: state.reserved,
      available: state.available,
      spend7d,
      history,
    };
  }
}
