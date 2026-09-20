import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { AgentRepository } from "@sigulon/database";
import {
  generateAgentBundle,
  compileBundleToSystemPrompt,
  regenerateAgentBundle,
} from "@/lib/agent-bundle-generator";
import { AgentSpecification } from "@sigulon/agent-schema/schema";

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

    let specToUse: AgentSpecification | null = null;
    let instruction = "";

    try {
      const body = await req.json();
      if (body.specification) {
        specToUse = body.specification;
      }
      if (typeof body.instruction === "string") {
        instruction = body.instruction;
      }
    } catch {
      // Body is optional
    }

    if (!specToUse) {
      specToUse = (agent.specification as unknown as AgentSpecification) || null;
    }

    if (!specToUse) {
      return NextResponse.json(
        { error: "No specification found for this agent to regenerate bundle from." },
        { status: 400 }
      );
    }

    const { bundle, generatedBy } = instruction && agent.bundle
      ? await regenerateAgentBundle(agent.bundle as unknown as import("@sigulon/agent-schema/schema").AgentBundle, instruction)
      : await generateAgentBundle(specToUse);
    const systemPrompt = compileBundleToSystemPrompt(bundle);

    const updated = await AgentRepository.updateDraft(id, orgId, {
      specification: specToUse as unknown as Record<string, unknown>,
      bundle: bundle as unknown as Record<string, unknown>,
      config: {
        ...agent.config,
        instructions: {
          ...agent.config.instructions,
          systemPrompt,
          greeting: bundle.first_response,
        },
      },
    });

    return NextResponse.json({
      agent: updated,
      bundle,
      generatedBy,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
