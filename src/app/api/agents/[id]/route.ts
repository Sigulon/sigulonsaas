import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import {
  AgentRepository,
  PhoneNumberRepository,
  CallModel,
  type CanonicalAgentConfig,
} from "@sigulon/database";
import {
  CARTESIA_STT_PROVIDER,
  CARTESIA_TTS_MODEL,
  CARTESIA_TTS_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId } = await getOrgContext();

    const agent = await AgentRepository.findById(id, orgId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const [phoneNumbers, callCount] = await Promise.all([
      PhoneNumberRepository.findByOrg(orgId),
      CallModel.countDocuments({ agentId: agent._id }),
    ]);

    const linkedNumbers = phoneNumbers.filter(
      (p) => p.agentId && p.agentId.toString() === agent._id.toString()
    );

    return NextResponse.json({
      agent: {
        id: agent._id.toString(),
        org_id: agent.organizationId.toString(),
        name: agent.name,
        status: agent.status,
        config: {
          ...agent.config,
          voice: {
            ...agent.config.voice,
            provider: CARTESIA_TTS_PROVIDER,
            model: CARTESIA_TTS_MODEL,
          },
          intelligence: {
            ...agent.config.intelligence,
            provider: "openrouter",
            model: OPENROUTER_DEFAULT_MODEL,
          },
          speech: {
            ...agent.config.speech,
            sttProvider: CARTESIA_STT_PROVIDER,
            sttModel: "ink-whisper",
            ttsProvider: CARTESIA_TTS_PROVIDER,
            ttsModel: CARTESIA_TTS_MODEL,
          },
        },
        specification: agent.specification,
        bundle: agent.bundle,
        language: agent.config.identity.language,
        voice_id: agent.config.voice.voiceId,
        system_prompt: agent.config.instructions.systemPrompt,
        introduction: agent.config.instructions.greeting,
        llm_provider: "openrouter",
        llm_model: OPENROUTER_DEFAULT_MODEL,
        stt_provider: CARTESIA_STT_PROVIDER,
        enabled_tools: agent.config.tools.enabledTools,
        phone_numbers: linkedNumbers.map((p) => ({
          id: p._id.toString(),
          phone_number: p.phoneNumber,
          direction: p.direction,
        })),
        calls: [{ count: callCount }],
        publishedVersionNumber: agent.publishedVersionNumber || 0,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, userId, role } = await getOrgContext();
    if (!canCreateAndRun(role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const body = await req.json();

    const existingAgent = await AgentRepository.findById(id, orgId);
    if (!existingAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (body.publish === true) {
      const { agent, version } = await AgentRepository.publish({
        agentId: id,
        orgId,
        publishedBy: userId,
        changeSummary: body.changeSummary || "Published changes",
      });
      return NextResponse.json({ agent, publishedVersion: version });
    }

    const partialConfig: Partial<CanonicalAgentConfig> = {
      voice: {
        ...existingAgent.config.voice,
        provider: CARTESIA_TTS_PROVIDER,
        model: CARTESIA_TTS_MODEL,
      },
      intelligence: {
        ...existingAgent.config.intelligence,
        provider: "openrouter",
        model: OPENROUTER_DEFAULT_MODEL,
      },
      speech: {
        ...existingAgent.config.speech,
        sttProvider: CARTESIA_STT_PROVIDER,
        sttModel: "ink-whisper",
        ttsProvider: CARTESIA_TTS_PROVIDER,
        ttsModel: CARTESIA_TTS_MODEL,
      },
    };
    if (body.voiceId || body.voice_id) {
      partialConfig.voice = {
        ...existingAgent.config.voice,
        voiceId: body.voiceId || body.voice_id,
      };
    }
    if (body.language) {
      partialConfig.identity = { ...existingAgent.config.identity, language: body.language };
    }
    if (body.systemPrompt || body.system_prompt) {
      partialConfig.instructions = {
        ...existingAgent.config.instructions,
        systemPrompt: body.systemPrompt || body.system_prompt,
      };
    }
    if (body.introduction !== undefined) {
      partialConfig.instructions = {
        ...(partialConfig.instructions || existingAgent.config.instructions),
        greeting: body.introduction,
      };
    }
    if (body.llmProvider || body.llm_provider || body.llmModel || body.llm_model) {
      partialConfig.intelligence = {
        ...(partialConfig.intelligence || existingAgent.config.intelligence),
        provider: "openrouter",
        model: OPENROUTER_DEFAULT_MODEL,
      };
    }
    if (body.sttProvider || body.stt_provider || body.ttsProvider || body.tts_provider) {
      partialConfig.speech = {
        ...existingAgent.config.speech,
        sttProvider: CARTESIA_STT_PROVIDER,
        sttModel: "ink-whisper",
        ttsProvider: CARTESIA_TTS_PROVIDER,
        ttsModel: CARTESIA_TTS_MODEL,
      };
    }
    if (body.enabledTools || body.enabled_tools) {
      partialConfig.tools = {
        ...existingAgent.config.tools,
        enabledTools: body.enabledTools || body.enabled_tools,
      };
    }

    const updated = await AgentRepository.updateDraft(id, orgId, {
      name: body.name,
      status: body.status,
      specification: body.specification,
      bundle: body.bundle,
      config: Object.keys(partialConfig).length > 0 ? partialConfig : undefined,
    });

    // updateDraft returns null when the row vanished between the read above
    // and the write (concurrent delete) — never hand back { agent: null } 200.
    if (!updated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ agent: updated });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, role } = await getOrgContext();
    if (!canCreateAndRun(role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }

    const deleted = await AgentRepository.delete(id, orgId);
    if (!deleted) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
