import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { AgentRepository } from "@sigulon/database";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, userId } = await getOrgContext();

    let changeSummary = "Published via Agent Studio";
    try {
      const body = await req.json();
      if (body.changeSummary) {
        changeSummary = body.changeSummary;
      }
    } catch {
      // Body is optional
    }

    const { agent, version } = await AgentRepository.publish({
      agentId: id,
      orgId,
      publishedBy: userId,
      changeSummary,
    });

    return NextResponse.json({
      success: true,
      agent,
      version,
    });
  } catch (err: unknown) {
    console.error("[POST /api/agents/[id]/publish] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
