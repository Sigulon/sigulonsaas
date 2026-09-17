import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/auth-helpers";
import { PhoneNumberRepository, AgentRepository } from "@sigulon/database";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;


    const numbers = await PhoneNumberRepository.findByOrg(orgId);

    const formatted = numbers.map((n) => ({
      id: n._id.toString(),
      phoneNumber: n.phoneNumber,
      countryCode: n.countryCode,
      provider: n.provider,
      direction: n.direction,
      status: n.status,
      agentId: n.agentId ? (typeof n.agentId === "object" && "_id" in n.agentId ? String((n.agentId as { _id: unknown })._id) : String(n.agentId)) : null,
      agentName: n.agentId && typeof n.agentId === "object" && "name" in n.agentId ? String((n.agentId as { name: unknown }).name) : null,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({ phoneNumbers: formatted });
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
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;
    const body = await req.json();

    const {
      phoneNumber,
      countryCode = "+91",
      direction = "both",
      provider = "plivo",
      agentId = null,
    } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required." },
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
        { error: "Invalid phone number. Must be a valid E.164 format (e.g. +919876543210 or +15551234567)." },
        { status: 400 }
      );
    }

    // Verify agent if provided
    if (agentId) {
      const agent = await AgentRepository.findById(agentId, orgId);
      if (!agent) {
        return NextResponse.json(
          { error: "Specified agent does not exist in this organization." },
          { status: 404 }
        );
      }
    }

    const existing = await PhoneNumberRepository.findByNumber(normalized);
    if (existing) {
      if (existing.organizationId.toString() === orgId) {
        const updated = await PhoneNumberRepository.assignAgent(
          existing._id,
          orgId,
          agentId
        );
        return NextResponse.json({
          phoneNumber: updated,
          message: "Number already existed and was updated with the selected agent.",
        });
      } else {
        return NextResponse.json(
          { error: "This phone number is already registered by another organization." },
          { status: 409 }
        );
      }
    }

    const created = await PhoneNumberRepository.create({
      organizationId: orgId,
      phoneNumber: normalized,
      countryCode,
      provider,
      direction,
      agentId: agentId || undefined,
    });

    return NextResponse.json({ phoneNumber: created }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
