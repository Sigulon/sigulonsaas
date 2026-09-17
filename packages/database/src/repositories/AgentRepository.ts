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
      agent.config = {
        ...agent.config,
        ...updates.config,
      } as CanonicalAgentConfig;
      agent.markModified("config");
    }

    return agent.save();
  }

  /**
   * Publish an agent: creates an immutable AgentVersion snapshot and updates the agent's published pointer.
   */
  static async publish(data: {
    agentId: string | mongoose.Types.ObjectId;
    orgId: string | mongoose.Types.ObjectId;
    publishedBy?: string | mongoose.Types.ObjectId;
    changeSummary?: string;
  }): Promise<{ agent: IAgent; version: IAgentVersion }> {
    return withTransaction(async (session) => {
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
  }

  static async getVersion(
    versionId: string | mongoose.Types.ObjectId
  ): Promise<IAgentVersion | null> {
    await connectToDatabase();
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
