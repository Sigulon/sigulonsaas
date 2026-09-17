import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/auth-helpers";
import {
  AgentRepository,
  PhoneNumberRepository,
} from "@sigulon/database";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;
    const body = await req.json().catch(() => ({}));

    const agent = await AgentRepository.findById(agentId, orgId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const {
      phoneNumber,
      countryCode = "+91",
      direction = "both",
      provider = "plivo",
      providerNumberId,
    } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Register an existing Plivo number from Telephony & Phone Numbers." },
        { status: 400 }
      );
    }
    if (provider !== "plivo") {
      return NextResponse.json(
        { error: "Only manually registered Plivo numbers are supported." },
        { status: 400 }
      );
    }

    const normalized = normalizePhone(phoneNumber);
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid phone number format." },
        { status: 400 }
      );
    }

    const existingNumber = await PhoneNumberRepository.findByNumber(normalized);
    if (existingNumber) {
      // Reassign to this agent if owned by same org
      if (existingNumber.organizationId.toString() === orgId) {
        const updated = await PhoneNumberRepository.assignAgent(
          existingNumber._id,
          orgId,
          agent._id
        );
        return NextResponse.json({ phoneNumber: updated });
      } else {
        return NextResponse.json(
          { error: "Phone number already registered to another organization." },
          { status: 409 }
        );
      }
    }

    const created = await PhoneNumberRepository.create({
      organizationId: orgId,
      agentId: agent._id,
      phoneNumber: normalized,
      countryCode,
      direction,
      provider,
      providerNumberId: providerNumberId || undefined,
      capabilities: ["inbound", "outbound"],
    });

    return NextResponse.json({ phoneNumber: created }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const httpStatus = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status: httpStatus });
  }
}
