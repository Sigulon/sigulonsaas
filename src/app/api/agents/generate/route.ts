import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { AgentRepository } from "@sigulon/database";
import { generateAgentWithLlm } from "@/lib/agent-generation";
import { checkOrgRateLimit, logTokenUsage } from "@/lib/rate-limiter";
import { compileBundleToSystemPrompt } from "@/lib/agent-bundle-generator";
import { CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";
import {
  CARTESIA_STT_PROVIDER,
  CARTESIA_TTS_MODEL,
  CARTESIA_TTS_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { orgId, role } = await getOrgContext();
    if (!canCreateAndRun(role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }

    // Rate-limit per org
    const rateCheck = await checkOrgRateLimit(orgId, "generate-agent", 15, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached for agent generation. Please wait ${rateCheck.resetInSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const description = (body.description || body.business_description || "").trim();

    if (!description || description.length < 10) {
      return NextResponse.json(
        { error: "Please provide a description of at least 10 characters." },
        { status: 400 }
      );
    }

    const mode = body.mode || "bulk";
    const language = body.language || "te-IN";
    const agentName = body.agentName?.trim() || undefined;
    const gender = body.gender || undefined;

    const wantsStream =
      req.nextUrl.searchParams.get("stream") === "true" ||
      req.headers.get("accept")?.includes("text/event-stream");

    if (wantsStream) {
      const responseStream = new TransformStream();
      const writer = responseStream.writable.getWriter();
      const encoder = new TextEncoder();

      const sendEvent = async (data: Record<string, unknown>) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      (async () => {
        try {
          const genResult = await generateAgentWithLlm({
            description,
            mode,
            language,
            agentName,
            gender,
            onProgress: async (step, message) => {
              await sendEvent({ step, message });
            },
          });

          await sendEvent({ step: "saving", message: "Saving draft agent…" });

          const bundle = genResult.bundle;
          const assignedName = bundle.exported_from.employee_name || agentName || "AI Agent";
          const chosenVoice =
            CARTESIA_VOICE_PRESETS.find((v) =>
              gender === "male" ? v.gender === "male" : v.gender === "female"
            )?.id || CARTESIA_VOICE_PRESETS[0].id;

          const systemPrompt = compileBundleToSystemPrompt(bundle);

          const newAgent = await AgentRepository.create({
            organizationId: orgId,
            name: assignedName,
            status: "draft",
            description,
            bundle,
            config: {
              identity: {
                name: assignedName,
                description: bundle.exported_from.employee_role,
                language: bundle.exported_from.language,
              },
              instructions: {
                systemPrompt,
                greeting: bundle.first_response,
              },
              voice: {
                provider: CARTESIA_TTS_PROVIDER,
                voiceId: chosenVoice,
                model: CARTESIA_TTS_MODEL,
                speed: 1.0,
              },
              intelligence: {
                provider: "openrouter",
                model: OPENROUTER_DEFAULT_MODEL,
                temperature: 0.3,
              },
              speech: {
                sttProvider: CARTESIA_STT_PROVIDER,
                sttModel: "ink-whisper",
                ttsProvider: CARTESIA_TTS_PROVIDER,
                ttsModel: CARTESIA_TTS_MODEL,
              },
              telephony: {
                provider: "plivo",
              },
              tools: {
                enabledTools: ["check_availability", "pricing_lookup"],
                toolConfigs: {},
              },
              settings: {
                interruptionHandling: true,
                silenceTimeout: 10,
                maxCallDuration: 600,
                recordingEnabled: true,
              },
            },
          });

          logTokenUsage({
            orgId,
            agentId: newAgent._id.toString(),
            action: "generate-agent",
            model: genResult.model,
            promptTokens: genResult.tokenUsage.promptTokens,
            completionTokens: genResult.tokenUsage.completionTokens,
            totalTokens: genResult.tokenUsage.totalTokens,
          });

          await sendEvent({
            step: "complete",
            message: "Agent generated successfully!",
            agentId: newAgent._id.toString(),
            agent: {
              id: newAgent._id.toString(),
              name: newAgent.name,
              bundle,
            },
          });
        } catch (genErr) {
          console.error("[POST /api/agents/generate] Stream error:", genErr);
          await sendEvent({
            step: "error",
            error: genErr instanceof Error ? genErr.message : "Failed to generate agent",
          });
        } finally {
          await writer.close();
        }
      })();

      return new Response(responseStream.readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming fallback
    const genResult = await generateAgentWithLlm({
      description,
      mode,
      language,
      agentName,
      gender,
    });

    const bundle = genResult.bundle;
    const assignedName = bundle.exported_from.employee_name || agentName || "AI Agent";
    const chosenVoice =
      CARTESIA_VOICE_PRESETS.find((v) =>
        gender === "male" ? v.gender === "male" : v.gender === "female"
      )?.id || CARTESIA_VOICE_PRESETS[0].id;

    const systemPrompt = compileBundleToSystemPrompt(bundle);

    const newAgent = await AgentRepository.create({
      organizationId: orgId,
      name: assignedName,
      status: "draft",
      description,
      bundle,
      config: {
        identity: {
          name: assignedName,
          description: bundle.exported_from.employee_role,
          language: bundle.exported_from.language,
        },
        instructions: {
          systemPrompt,
          greeting: bundle.first_response,
        },
        voice: {
          provider: CARTESIA_TTS_PROVIDER,
          voiceId: chosenVoice,
          model: CARTESIA_TTS_MODEL,
          speed: 1.0,
        },
        intelligence: {
          provider: "openrouter",
          model: OPENROUTER_DEFAULT_MODEL,
          temperature: 0.3,
        },
        speech: {
          sttProvider: CARTESIA_STT_PROVIDER,
          sttModel: "ink-whisper",
          ttsProvider: CARTESIA_TTS_PROVIDER,
          ttsModel: CARTESIA_TTS_MODEL,
        },
        telephony: {
          provider: "plivo",
        },
        tools: {
          enabledTools: ["check_availability", "pricing_lookup"],
          toolConfigs: {},
        },
        settings: {
          interruptionHandling: true,
          silenceTimeout: 10,
          maxCallDuration: 600,
          recordingEnabled: true,
        },
      },
    });

    logTokenUsage({
      orgId,
      agentId: newAgent._id.toString(),
      action: "generate-agent",
      model: genResult.model,
      promptTokens: genResult.tokenUsage.promptTokens,
      completionTokens: genResult.tokenUsage.completionTokens,
      totalTokens: genResult.tokenUsage.totalTokens,
    });

    return NextResponse.json({
      success: true,
      agentId: newAgent._id.toString(),
      agent: {
        id: newAgent._id.toString(),
        name: newAgent.name,
        bundle,
      },
    });
  } catch (err: unknown) {
    console.error("[POST /api/agents/generate] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
