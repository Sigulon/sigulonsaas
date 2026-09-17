import { connectToDatabase } from "../client";
import { WebhookEventModel, IWebhookEvent } from "../models/WebhookEvent";
import crypto from "crypto";

export class WebhookEventRepository {
  static async isProcessedOrSeen(
    provider: string,
    eventId: string
  ): Promise<boolean> {
    await connectToDatabase();
    const count = await WebhookEventModel.countDocuments({
      provider,
      eventId,
    }).exec();
    return count > 0;
  }

  static async claimOrIgnore(data: {
    provider: string;
    eventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<{ shouldProcess: boolean; event: IWebhookEvent }> {
    await connectToDatabase();
    const payloadHash = crypto
      .createHash("sha256")
      .update(typeof data.payload === "string" ? data.payload : JSON.stringify(data.payload))
      .digest("hex");

    try {
      const event = new WebhookEventModel({
        provider: data.provider,
        eventId: data.eventId,
        eventType: data.eventType,
        payloadHash,
        status: "received",
        receivedAt: new Date(),
      });
      await event.save();
      return { shouldProcess: true, event };
    } catch (err: unknown) {
      // Duplicate eventId
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        const existing = await WebhookEventModel.findOne({
          provider: data.provider,
          eventId: data.eventId,
        }).exec();
        return { shouldProcess: false, event: existing! };
      }
      throw err;
    }
  }

  static async markProcessed(
    provider: string,
    eventId: string
  ): Promise<void> {
    await connectToDatabase();
    await WebhookEventModel.updateOne(
      { provider, eventId },
      { status: "processed", processedAt: new Date() }
    ).exec();
  }

  static async markFailed(
    provider: string,
    eventId: string,
    error: string
  ): Promise<void> {
    await connectToDatabase();
    await WebhookEventModel.updateOne(
      { provider, eventId },
      { status: "failed", error, processedAt: new Date() }
    ).exec();
  }
}
