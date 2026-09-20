import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import {
  AgentRepository,
  PhoneNumberRepository,
} from "@sigulon/database";
import { compileBundleToSystemPrompt } from "@/lib/agent-bundle-generator";
import { repairAgentBundle, validateAgentBundle } from "@sigulon/agent-schema/validation";
import {
  CARTESIA_STT_PROVIDER,
  CARTESIA_TTS_MODEL,
  CARTESIA_TTS_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const requestStartedAt = performance.now();
    const { orgId } = await getOrgContext();

    const [agents, phoneNumbers] = await Promise.all([
      AgentRepository.findSummariesByOrg(orgId),
      PhoneNumberRepository.findAssignmentsByOrg(orgId),
    ]);

    const numbersByAgent = new Map<string, Array<{ id: string; phone_number: string; direction: string }>>();
    for (const phoneNumber of phoneNumbers) {
      if (!phoneNumber.agentId) continue;
      const agentId = phoneNumber.agentId.toString();
      const numbers = numbersByAgent.get(agentId) || [];
      numbers.push({
        id: phoneNumber._id.toString(),
        phone_number: phoneNumber.phoneNumber,
        direction: phoneNumber.direction,
      });
      numbersByAgent.set(agentId, numbers);
    }

    const formattedAgents = agents.map((ag) => {
      const numbers = numbersByAgent.get(ag._id.toString()) || [];

      return {
        id: ag._id.toString(),
        org_id: ag.organizationId.toString(),
        name: ag.name,
        language: ag.config.identity.language || "hi",
        voice_id: ag.config.voice.voiceId,
        system_prompt: ag.config.instructions.systemPrompt,
        introduction: ag.config.instructions.greeting || "",
        status: ag.status,
        llm_provider: "openrouter",
        llm_model: OPENROUTER_DEFAULT_MODEL,
        stt_provider: CARTESIA_STT_PROVIDER,
        enabled_tools: ag.config.tools.enabledTools,
        phone_numbers: numbers,
        created_at: ag.createdAt.toISOString(),
        updated_at: ag.updatedAt.toISOString(),
      };
    });

    console.info(JSON.stringify({
      event: "api_latency",
      route: "/api/agents",
      stage: "response_ready",
      durationMs: Math.round(performance.now() - requestStartedAt),
      agentCount: formattedAgents.length,
    }));

    return NextResponse.json({ agents: formattedAgents });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getOrgContext();
    if (!canCreateAndRun(context.role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const { orgId } = context;
    const body = await req.json();

    const {
      name,
      voiceId,
      language = "hi",
      systemPrompt: requestedSystemPrompt,
      introduction = "",
      enabledTools = ["check_availability", "pricing_lookup"],
      settings = {},
      specification,
      bundle: requestedBundle,
      status: agentStatus = "active",
    } = body;
    const llmProvider = "openrouter";
    const llmModel = OPENROUTER_DEFAULT_MODEL;
    const sttProvider = CARTESIA_STT_PROVIDER;
    const ttsProvider = CARTESIA_TTS_PROVIDER;

    let bundle = requestedBundle;
    let systemPrompt = requestedSystemPrompt;
    let effectiveLanguage = language;
    let effectiveIntroduction = introduction;

    if (requestedBundle && typeof requestedBundle === "object") {
      const repaired = repairAgentBundle(requestedBundle as Record<string, unknown>);
      const validation = validateAgentBundle(repaired);
      if (!validation.valid || !validation.bundle) {
        return NextResponse.json({ error: "Invalid generated agent bundle.", details: validation.errors }, { status: 400 });
      }
      bundle = validation.bundle;
      systemPrompt = compileBundleToSystemPrompt(validation.bundle);
      effectiveLanguage = validation.bundle.exported_from.language;
      effectiveIntroduction = validation.bundle.first_response;
    }

    if (!name || !voiceId || !systemPrompt) {
      return NextResponse.json(
        { error: "Name, voiceId, and systemPrompt are required." },
        { status: 400 }
      );
    }

    const newAgent = await AgentRepository.create({
      organizationId: orgId,
      name,
      status: agentStatus,
      specification,
      bundle,
      config: {
        identity: {
          name,
          description: "AI Voice Agent",
          language: effectiveLanguage,
        },
        instructions: {
          systemPrompt,
          greeting: effectiveIntroduction,
        },
        voice: {
          provider: ttsProvider,
          voiceId,
          model: CARTESIA_TTS_MODEL,
          speed: 1.0,
        },
        intelligence: {
          provider: llmProvider,
          model: llmModel,
          temperature: 0.7,
        },
        speech: {
          sttProvider,
          sttModel: "ink-whisper",
          ttsProvider,
          ttsModel: CARTESIA_TTS_MODEL,
        },
        telephony: {
          provider: "plivo",
        },
        tools: {
          enabledTools,
          toolConfigs: {},
        },
        settings: {
          interruptionHandling: true,
          silenceTimeout: 10,
          maxCallDuration: 600,
          recordingEnabled: true,
          ...settings,
        },
      },
    });

    return NextResponse.json(
      {
        agent: {
          id: newAgent._id.toString(),
          org_id: newAgent.organizationId.toString(),
          name: newAgent.name,
          status: newAgent.status,
          config: newAgent.config,
          specification: newAgent.specification,
          bundle: newAgent.bundle,
          phone_numbers: [],
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
