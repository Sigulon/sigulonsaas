import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import {
  generateAgentBundle,
  compileBundleToSystemPrompt,
  normalizeGenerationInput,
} from "@/lib/agent-bundle-generator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await getOrgContext(); // Require valid authenticated session
    const body = await req.json();

    const input = body.specification || body;

    if (!input || typeof input !== "object") {
      return NextResponse.json(
        { error: "A voice-agent request is required." },
        { status: 400 }
      );
    }

    const natural = input as { business_description?: unknown; agent_goal?: unknown };
    const isNaturalRequest = "business_description" in input || "agent_goal" in input || "mode" in input;
    if (
      isNaturalRequest &&
      (typeof natural.business_description !== "string" || !natural.business_description.trim() ||
        typeof natural.agent_goal !== "string" || !natural.agent_goal.trim())
    ) {
      return NextResponse.json(
        { error: "business_description and agent_goal are required." },
        { status: 400 }
      );
    }

    const spec = normalizeGenerationInput(input);

    const { bundle, generatedBy } = await generateAgentBundle(spec);
    const systemPrompt = compileBundleToSystemPrompt(bundle);

    return NextResponse.json({
      success: true,
      agent: bundle,
      bundle,
      specification: spec,
      system_prompt: systemPrompt,
      generatedBy,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
