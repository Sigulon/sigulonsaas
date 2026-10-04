import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { AgentRepository } from "@sigulon/database";
import { applyAiAssist } from "@/lib/agent-assist";
import { generateAgentWithLlm } from "@/lib/agent-generation";
import { compileBundleToSystemPrompt } from "@/lib/agent-bundle";
import { AgentBundle } from "@/lib/agent-bundle/schema";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
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

    const agent = await AgentRepository.findById(id, orgId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { instruction, fromDescription, bundle: passedBundle } = body;

    // 1. AI Assist mode: Modify bundle and return diff
    if (instruction && typeof instruction === "string" && instruction.trim()) {
      const currentBundle = (passedBundle || agent.bundle) as AgentBundle;
      if (!currentBundle) {
        return NextResponse.json(
          { error: "No bundle found to apply AI assist to." },
          { status: 400 }
        );
      }

      const assistResult = await applyAiAssist(currentBundle, instruction.trim());
      return NextResponse.json({
        success: true,
        type: "ai_assist",
        modifiedBundle: assistResult.modifiedBundle,
        diff: assistResult.diff,
      });
    }

    // 2. Full regeneration from description
    const descriptionToUse = agent.description || body.description || agent.name;
    if (!descriptionToUse) {
      return NextResponse.json(
        { error: "No original description found to regenerate agent." },
        { status: 400 }
      );
    }

    const currentBundle = agent.bundle as AgentBundle | null;
    const mode = currentBundle?.exported_from?.mode || "bulk";
    const language = currentBundle?.exported_from?.language || "te-IN";
    const agentName = currentBundle?.exported_from?.employee_name || agent.name;

    const genResult = await generateAgentWithLlm({
      description: descriptionToUse,
      mode,
      language,
      agentName,
    });

    const newBundle = genResult.bundle;
    const systemPrompt = compileBundleToSystemPrompt(newBundle);

    const updated = await AgentRepository.updateDraft(id, orgId, {
      bundle: newBundle as unknown as Record<string, unknown>,
      config: {
        ...agent.config,
        instructions: {
          ...agent.config.instructions,
          systemPrompt,
          greeting: newBundle.first_response,
        },
      },
    });

    return NextResponse.json({
      success: true,
      type: "regenerate_from_description",
      agent: updated,
      bundle: newBundle,
    });
  } catch (err: unknown) {
    console.error("[POST /api/agents/[id]/regenerate] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
