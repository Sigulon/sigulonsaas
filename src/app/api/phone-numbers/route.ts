import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/auth-helpers";
import { PhoneNumberRepository, AgentRepository } from "@sigulon/database";
import { normalizePhone } from "@/lib/phone";
import { LIVEKIT_AGENT_NAME, buildDispatchMetadata, zentrunkUriForProject } from "@/lib/livekit";

export const dynamic = "force-dynamic";

async function provisionLivekitInboundTrunk(input: {
  orgId: string;
  agentId: string | null;
  phoneNumber: string;
  region: string;
}): Promise<string> {
  // Best-effort: creates a LiveKit inbound SIP trunk for this number with
  // metadata {orgId, agentId}. The Plivo Zentrunk for the number must point
  // at zentrunkUriForProject() (see docs/voice-runtime.md).
  try {
    const mod = await import("livekit-server-sdk");
    const SipClient = (mod as { SipClient?: new (u: string, k: string, s: string) => unknown }).SipClient;
    if (!SipClient) return "";
    const client = new SipClient(
      process.env.LIVEKIT_URL || "",
      process.env.LIVEKIT_API_KEY || "",
      process.env.LIVEKIT_API_SECRET || ""
    ) as {
      createSipInboundTrunk?: (name: string, numbers: string[], opts?: unknown) => Promise<{ sipTrunkId?: string; trunkId?: string }>;
      createSipDispatchRule?: (rule: unknown, opts?: unknown) => Promise<unknown>;
    };
    if (typeof client.createSipInboundTrunk !== "function") return "";
    const metaStr = buildDispatchMetadata({
      orgId: input.orgId,
      agentId: input.agentId || "",
      phoneNumber: input.phoneNumber,
      direction: "inbound",
    });
    const res = await client.createSipInboundTrunk(
      `sigulon-${input.orgId}-${input.phoneNumber}`,
      [input.phoneNumber],
      { metadata: metaStr }
    );
    const trunkId = String(res?.sipTrunkId || res?.trunkId || "");
    if (trunkId && typeof client.createSipDispatchRule === "function") {
      try {
        await client.createSipDispatchRule(
          {
            type: "individual",
            roomPrefix: "sigulon-call-",
          },
          {
            trunkIds: [trunkId],
            name: `rule-${input.phoneNumber}`,
            metadata: metaStr,
          }
        );
      } catch (ruleErr) {
        console.warn("[phone-numbers] LiveKit dispatch rule creation warning:", ruleErr);
      }
    }
    return trunkId;
  } catch (err) {
    console.warn("[phone-numbers] LiveKit trunk provisioning skipped:", err);
    return "";
  }
}

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
      region: (n as { region?: string }).region || "us-east",
      lkTrunkId: (n as { lkTrunkId?: string }).lkTrunkId || "",
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
      region: normalized.startsWith("+91") ? "in-mumbai" : "us-east",
    });

    // Provision the LiveKit inbound trunk (metadata {orgId, agentId}).
    // Point the Plivo Zentrunk for this number at `zentrunkUriForProject()`.
    const lkTrunkId = await provisionLivekitInboundTrunk({
      orgId,
      agentId: agentId || null,
      phoneNumber: normalized,
      region: (created as { region?: string }).region || "us-east",
    });
    let withTrunk = created;
    if (lkTrunkId) {
      withTrunk =
        (await PhoneNumberRepository.update(created._id, orgId, { lkTrunkId })) || created;
    }

    return NextResponse.json(
      {
        phoneNumber: withTrunk,
        plivoZentrunkUri: zentrunkUriForProject(),
        livekitAgent: LIVEKIT_AGENT_NAME,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
