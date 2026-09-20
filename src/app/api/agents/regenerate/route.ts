import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { regenerateAgentBundle } from "@/lib/agent-bundle-generator";
import { repairAgentBundle, validateAgentBundle } from "@sigulon/agent-schema/validation";

export const dynamic = "force-dynamic";

/**
 * Regenerates wording only. The client sends a current bundle rather than an
 * agent id so it can iterate safely before saving or publishing a draft.
 */
export async function POST(req: NextRequest) {
  try {
    const { role } = await getOrgContext();
    if (!canCreateAndRun(role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const body = await req.json();
    const candidate = body.agent || body.bundle;
    if (!candidate || typeof candidate !== "object") {
      return NextResponse.json({ error: "agent bundle is required" }, { status: 400 });
    }

    const repaired = repairAgentBundle(candidate as Record<string, unknown>);
    const validation = validateAgentBundle(repaired);
    if (!validation.valid || !validation.bundle) {
      return NextResponse.json({ error: "Invalid agent bundle", details: validation.errors }, { status: 400 });
    }

    const result = await regenerateAgentBundle(validation.bundle, typeof body.instruction === "string" ? body.instruction : "");
    return NextResponse.json({ success: true, agent: result.bundle, bundle: result.bundle, generatedBy: result.generatedBy });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
