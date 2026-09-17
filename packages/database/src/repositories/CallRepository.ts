import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { CallModel, ICall, CallState } from "../models/Call";
import { CallEventModel, ICallEvent } from "../models/CallEvent";
import { TranscriptModel, ITranscript, ITranscriptSegment } from "../models/Transcript";
import { CallOutcomeModel, ICallOutcome } from "../models/CallOutcome";
import { RecordingModel, IRecording } from "../models/Recording";

// Canonical allowed transitions
const VALID_TRANSITIONS: Record<CallState, CallState[]> = {
  CREATED: ["QUEUED", "DIALING", "CANCELLED", "FAILED"],
  QUEUED: ["DIALING", "CANCELLED", "FAILED"],
  DIALING: ["RINGING", "ANSWERED", "BUSY", "NO_ANSWER", "FAILED", "CANCELLED"],
  RINGING: ["ANSWERED", "BUSY", "NO_ANSWER", "FAILED", "CANCELLED"],
  ANSWERED: ["IN_PROGRESS", "COMPLETED", "FAILED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  BUSY: [],
  NO_ANSWER: [],
  CANCELLED: [],
};

export class CallRepository {
  static async create(callData: {
    organizationId: string | mongoose.Types.ObjectId;
    agentId: string | mongoose.Types.ObjectId;
    agentVersionId?: string | mongoose.Types.ObjectId;
    campaignId?: string | mongoose.Types.ObjectId;
    contactId?: string | mongoose.Types.ObjectId;
    phoneNumberId?: string | mongoose.Types.ObjectId;
    provider?: string;
    providerCallId?: string;
    idempotencyKey?: string;
    direction: "inbound" | "outbound";
    status?: CallState;
    fromNumber?: string;
    toNumber: string;
    metadata?: Record<string, unknown>;
  }): Promise<ICall> {
    await connectToDatabase();
    const call = new CallModel({
      ...callData,
      status: callData.status || "CREATED",
      durationSeconds: 0,
      costCredits: 0,
      metadata: callData.metadata || {},
    });
    return call.save();
  }

  static async findById(
    callId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<ICall | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: callId };
    if (orgId) query.organizationId = orgId;
    return CallModel.findOne(query)
      .populate("agentId", "name config.voice")
      .populate("contactId", "name phone normalizedPhone")
      .populate("transcriptId")
      .populate("recordingId")
      .exec();
  }

  static async findByProviderCallId(
    providerCallId: string
  ): Promise<ICall | null> {
    await connectToDatabase();
    return CallModel.findOne({ providerCallId }).exec();
  }

  static async findByIdempotencyKey(
    orgId: string | mongoose.Types.ObjectId,
    idempotencyKey: string
  ): Promise<ICall | null> {
    await connectToDatabase();
    return CallModel.findOne({ organizationId: orgId, idempotencyKey }).exec();
  }

  /**
   * Small, non-populated call projection used by the latency-sensitive
   * telephony turn handler. Dashboard reads should continue to use findById.
   */
  static async findForLiveConversation(
    callId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<ICall | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: callId };
    if (orgId) query.organizationId = orgId;
    return CallModel.findOne(query)
      .select("_id organizationId agentId direction status createdAt answeredAt")
      .lean<ICall>()
      .exec();
  }

  static async findForLiveConversationByProviderCallId(
    providerCallId: string
  ): Promise<ICall | null> {
    await connectToDatabase();
    return CallModel.findOne({ providerCallId })
      .select("_id organizationId agentId direction status createdAt answeredAt")
      .lean<ICall>()
      .exec();
  }

  static async transitionState(
    callId: string | mongoose.Types.ObjectId,
    targetState: CallState,
    extraUpdates?: Partial<ICall>
  ): Promise<ICall | null> {
    await connectToDatabase();
    // State changes arrive from Plivo and the runtime concurrently. Restrict
    // the write to legal source states so a stale callback cannot overwrite a
    // newer terminal state between a read and a later save.
    const validSources = (Object.entries(VALID_TRANSITIONS) as Array<
      [CallState, CallState[]]
    >)
      .filter(([, targets]) => targets.includes(targetState))
      .map(([source]) => source);
    const admissibleStates = [...new Set([...validSources, targetState])];

    const call = await CallModel.findOneAndUpdate(
      { _id: callId, status: { $in: admissibleStates } },
      { $set: { ...(extraUpdates || {}), status: targetState } },
      { new: true }
    ).exec();
    if (call) return call;

    // Preserve the previous API contract for an invalid or already-terminal
    // transition while leaving its stored state untouched.
    return CallModel.findById(callId).exec();
  }

  static async addEvent(eventData: {
    callId: string | mongoose.Types.ObjectId;
    organizationId: string | mongoose.Types.ObjectId;
    type: string;
    data?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<ICallEvent | null> {
    await connectToDatabase();
    try {
      const event = new CallEventModel({
        callId: eventData.callId,
        organizationId: eventData.organizationId,
        type: eventData.type,
        data: eventData.data || {},
        idempotencyKey: eventData.idempotencyKey,
        timestamp: new Date(),
      });
      return await event.save();
    } catch (err: unknown) {
      // Duplicate idempotency key
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        return null;
      }
      throw err;
    }
  }

  static async saveTranscript(
    callId: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    segments: ITranscriptSegment[]
  ): Promise<ITranscript> {
    await connectToDatabase();
    const transcript = await TranscriptModel.findOneAndUpdate(
      { callId },
      { organizationId: orgId, segments },
      { upsert: true, returnDocument: "after" }
    ).exec();

    await CallModel.findByIdAndUpdate(callId, {
      transcriptId: transcript._id,
    }).exec();

    return transcript;
  }

  static async getTranscript(
    callId: string | mongoose.Types.ObjectId
  ): Promise<ITranscript | null> {
    await connectToDatabase();
    return TranscriptModel.findOne({ callId }).exec();
  }

  static async saveOutcome(
    callId: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    data: {
      disposition: string;
      leadStatus?: string;
      interestLevel?: "high" | "medium" | "low" | "none";
      requestedCallback?: boolean;
      budget?: string;
      location?: string;
      appointmentDate?: Date;
      customFields?: Record<string, unknown>;
    }
  ): Promise<ICallOutcome> {
    await connectToDatabase();
    const outcome = await CallOutcomeModel.findOneAndUpdate(
      { callId },
      {
        organizationId: orgId,
        ...data,
      },
      { upsert: true, returnDocument: "after" }
    ).exec();

    await CallModel.findByIdAndUpdate(callId, {
      outcome: data.disposition,
    }).exec();

    return outcome;
  }

  static async saveRecording(data: {
    callId: string | mongoose.Types.ObjectId;
    organizationId: string | mongoose.Types.ObjectId;
    storageProvider: string;
    bucket: string;
    objectKey: string;
    durationSeconds?: number;
    format?: string;
    sizeBytes?: number;
    status?: "uploading" | "ready" | "failed";
  }): Promise<IRecording> {
    await connectToDatabase();
    const recording = new RecordingModel(data);
    await recording.save();

    await CallModel.findByIdAndUpdate(data.callId, {
      recordingId: recording._id,
    }).exec();

    return recording;
  }

  static async findByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: {
      agentId?: string;
      campaignId?: string;
      status?: string;
      outcome?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ calls: ICall[]; total: number }> {
    await connectToDatabase();
    const query: Record<string, unknown> = { organizationId: orgId };
    if (options?.agentId) query.agentId = options.agentId;
    if (options?.campaignId) query.campaignId = options.campaignId;
    if (options?.status) query.status = options.status;
    if (options?.outcome) query.outcome = options.outcome;

    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    const [calls, total] = await Promise.all([
      CallModel.find(query)
        .populate("agentId", "name config.voice.voiceId")
        .populate("contactId", "name phone normalizedPhone")
        .populate("transcriptId")
        .populate("recordingId")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      CallModel.countDocuments(query).exec(),
    ]);

    return { calls, total };
  }

  /**
   * MongoDB aggregation pipeline for real dashboard analytics.
   */
  static async getDashboardStats(orgId: string | mongoose.Types.ObjectId): Promise<{
    totalCalls: number;
    answeredCalls: number;
    answerRatePercentage: number;
    avgDurationSeconds: number;
    totalCreditsSpent: number;
    chartData: Array<{ date: string; calls: number; answered: number }>;
  }> {
    await connectToDatabase();
    const objectId = typeof orgId === "string" ? new mongoose.Types.ObjectId(orgId) : orgId;

    const [aggregateMetrics, dailyTrend] = await Promise.all([
      CallModel.aggregate([
        { $match: { organizationId: objectId } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            answeredCalls: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["ANSWERED", "IN_PROGRESS", "COMPLETED"]] },
                  1,
                  0,
                ],
              },
            },
            totalDuration: { $sum: "$durationSeconds" },
            callsWithDuration: {
              $sum: { $cond: [{ $gt: ["$durationSeconds", 0] }, 1, 0] },
            },
            totalCreditsSpent: { $sum: "$costCredits" },
          },
        },
      ]).exec(),

      CallModel.aggregate([
        {
          $match: {
            organizationId: objectId,
            createdAt: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            calls: { $sum: 1 },
            answered: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["ANSWERED", "IN_PROGRESS", "COMPLETED"]] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec(),
    ]);

    const m = aggregateMetrics[0] || {
      totalCalls: 0,
      answeredCalls: 0,
      totalDuration: 0,
      callsWithDuration: 0,
      totalCreditsSpent: 0,
    };

    const total = m.totalCalls || 0;
    const answered = m.answeredCalls || 0;
    const answerRate = total > 0 ? Number(((answered / total) * 100).toFixed(1)) : 0;
    const avgDuration =
      m.callsWithDuration > 0 ? Math.round(m.totalDuration / m.callsWithDuration) : 0;

    // Fill last 7 days chart format
    const chartMap = new Map<string, { calls: number; answered: number }>();
    dailyTrend.forEach((d: { _id: string; calls: number; answered: number }) => {
      chartMap.set(d._id, { calls: d.calls, answered: d.answered });
    });

    const chartData: Array<{ date: string; calls: number; answered: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const entry = chartMap.get(key) || { calls: 0, answered: 0 };
      chartData.push({
        date: d.toLocaleDateString("en-US", { weekday: "short" }),
        calls: entry.calls,
        answered: entry.answered,
      });
    }

    return {
      totalCalls: total,
      answeredCalls: answered,
      answerRatePercentage: answerRate,
      avgDurationSeconds: avgDuration,
      totalCreditsSpent: Number((m.totalCreditsSpent || 0).toFixed(2)),
      chartData,
    };
  }
}
