import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/auth-helpers";
import { PhoneNumberRepository, AgentRepository } from "@sigulon/database";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;
    const body = await req.json();

    const { agentId, direction, status } = body;

    if (agentId) {
      const agent = await AgentRepository.findById(agentId, orgId);
      if (!agent) {
        return NextResponse.json(
          { error: "Agent not found" },
          { status: 404 }
        );
      }
    }

    const updated = await PhoneNumberRepository.update(id, orgId, {
      ...(agentId !== undefined && { agentId: agentId || null }),
      ...(direction && { direction }),
      ...(status && { status }),
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Phone number not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ phoneNumber: updated });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;

    const deleted = await PhoneNumberRepository.delete(id, orgId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Phone number not found or already deleted." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
