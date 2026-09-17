import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { AgentRepository } from "@sigulon/database";
import { validateAgentBundle } from "@sigulon/agent-schema/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId } = await getOrgContext();

    const agent = await AgentRepository.findById(id, orgId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    let bundleToValidate: unknown = agent.bundle;

    try {
      const body = await req.json();
      if (body.bundle) {
        bundleToValidate = body.bundle;
      }
    } catch {
      // Body is optional
    }

    if (!bundleToValidate) {
      return NextResponse.json(
        { error: "No bundle found to validate." },
        { status: 400 }
      );
    }

    const result = validateAgentBundle(bundleToValidate);

    return NextResponse.json({
      valid: result.valid,
      errors: result.errors,
      bundle: result.bundle,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
