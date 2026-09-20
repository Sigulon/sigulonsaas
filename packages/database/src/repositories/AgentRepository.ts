import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import { AgentModel, IAgent, CanonicalAgentConfig } from "../models/Agent";
import { AgentVersionModel, IAgentVersion } from "../models/AgentVersion";
import { withTransaction } from "../transactions";

export class AgentRepository {
  /** Lightweight projection for agent pickers and the dashboard list. */
  static async findSummariesByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: { status?: string }
  ): Promise<IAgent[]> {
    await connectToDatabase();
    const query: Record<string, unknown> = { organizationId: orgId };
    if (options?.status) query.status = options.status;
    return AgentModel.find(query)
      .select([
        "_id", "organizationId", "name", "status", "createdAt", "updatedAt",
        "config.identity.language", "config.instructions.systemPrompt", "config.instructions.greeting",
        "config.voice.voiceId", "config.intelligence.provider", "config.intelligence.model",
        "config.speech.sttProvider", "config.tools.enabledTools",
      ].join(" "))
      .sort({ createdAt: -1 })
      .lean<IAgent[]>()
      .exec();
  }

  static async findByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: { status?: string }
  ): Promise<IAgent[]> {
    await connectToDatabase();
    const query: Record<string, unknown> = { organizationId: orgId };
    if (options?.status) {
      query.status = options.status;
    }
    return AgentModel.find(query).sort({ createdAt: -1 }).exec();
  }

  static async findById(
    agentId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<IAgent | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: agentId };
    if (orgId) {
      query.organizationId = orgId;
    }
    return AgentModel.findOne(query).exec();
  }

  static async create(data: {
    organizationId: string | mongoose.Types.ObjectId;
    name: string;
    config: CanonicalAgentConfig;
    specification?: Record<string, unknown>;
    bundle?: Record<string, unknown>;
    status?: "draft" | "active" | "paused";
  }): Promise<IAgent> {
    await connectToDatabase();
    const agent = new AgentModel({
      organizationId: data.organizationId,
      name: data.name.trim(),
      config: data.config,
      specification: data.specification,
      bundle: data.bundle,
      status: data.status || "draft",
    });
    return agent.save();
  }

  static async updateDraft(
    agentId: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    updates: {
      name?: string;
      config?: Partial<CanonicalAgentConfig>;
      specification?: Record<string, unknown>;
      bundle?: Record<string, unknown>;
      status?: "draft" | "active" | "paused";
    }
  ): Promise<IAgent | null> {
    await connectToDatabase();
    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId: orgId,
    }).exec();

    if (!agent) return null;

    if (updates.name) agent.name = updates.name.trim();
    if (updates.status) agent.status = updates.status;
    if (updates.specification !== undefined) {
      agent.specification = updates.specification;
      agent.markModified("specification");
    }
    if (updates.bundle !== undefined) {
      agent.bundle = updates.bundle;
      agent.markModified("bundle");
    }
    if (updates.config) {
      // Deep-merge one level: a partial `voice`/`instructions`/etc. payload
      // must merge into the stored subdocument, not replace it and wipe
      // sibling defaults (provider, model, speed, ...).
      const merged: Record<string, unknown> = {
        ...(agent.config as unknown as Record<string, unknown>),
      };
      for (const [key, value] of Object.entries(updates.config)) {
        const existing = merged[key];
        const bothPlainObjects =
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          !(value instanceof Date) &&
          existing !== null &&
          typeof existing === "object" &&
          !Array.isArray(existing) &&
          !(existing instanceof Date);
        merged[key] = bothPlainObjects
          ? {
              ...(existing as Record<string, unknown>),
              ...(value as Record<string, unknown>),
            }
          : value;
      }
      agent.config = merged as unknown as CanonicalAgentConfig;
      agent.markModified("config");
    }

    return agent.save();
  }

  /**
   * Publish an agent: creates an immutable AgentVersion snapshot and updates the agent's published pointer.
   * Retries on duplicate versionNumber (11000) up to 5 attempts for concurrent publishes.
   */
  static async publish(data: {
    agentId: string | mongoose.Types.ObjectId;
    orgId: string | mongoose.Types.ObjectId;
    publishedBy?: string | mongoose.Types.ObjectId;
    changeSummary?: string;
  }): Promise<{ agent: IAgent; version: IAgentVersion }> {
    const MAX_PUBLISH_ATTEMPTS = 5;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt++) {
      try {
        return await withTransaction(async (session) => {
          const agent = await AgentModel.findOne({
            _id: data.agentId,
            organizationId: data.orgId,
          }).session(session);

          if (!agent) {
            throw new Error("Agent not found");
          }

          const nextVersionNumber = (agent.publishedVersionNumber || 0) + 1;

          const validPublishedBy =
            data.publishedBy && mongoose.Types.ObjectId.isValid(data.publishedBy)
              ? new mongoose.Types.ObjectId(data.publishedBy)
              : undefined;

          const version = new AgentVersionModel({
            agentId: agent._id,
            organizationId: agent.organizationId,
            versionNumber: nextVersionNumber,
            config: agent.config,
            specification: agent.specification,
            bundle: agent.bundle,
            publishedBy: validPublishedBy,
            changeSummary: data.changeSummary || `Version ${nextVersionNumber}`,
          });
          await version.save({ session });

          agent.currentVersionId = version._id;
          agent.publishedVersionNumber = nextVersionNumber;
          agent.status = "active";
          await agent.save({ session });

          return { agent, version };
        });
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: number }).code;
        const msg = err instanceof Error ? err.message : String(err);
        const isDuplicateVersion =
          code === 11000 || /agentId.*versionNumber|versionNumber.*duplicate|E11000/i.test(msg);
        if (isDuplicateVersion && attempt < MAX_PUBLISH_ATTEMPTS) {
          // Concurrent publish won this versionNumber; recompute and retry.
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Publish failed after retries");
  }

  static async getVersion(
    versionId: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<IAgentVersion | null> {
    await connectToDatabase();
    if (orgId) {
      return AgentVersionModel.findOne({
        _id: versionId,
        organizationId: orgId,
      }).exec();
    }
    return AgentVersionModel.findById(versionId).exec();
  }

  static async listVersions(
    agentId: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId
  ): Promise<IAgentVersion[]> {
    await connectToDatabase();
    return AgentVersionModel.find({
      agentId,
      organizationId: orgId,
    })
      .sort({ versionNumber: -1 })
      .exec();
  }

  static async delete(
    agentId: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    await connectToDatabase();
    const res = await AgentModel.deleteOne({
      _id: agentId,
      organizationId: orgId,
    }).exec();
    return res.deletedCount > 0;
  }
}
