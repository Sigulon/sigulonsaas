import { NextRequest, NextResponse } from "next/server";
import {
  OrganizationRepository,
  AgentRepository,
  BillingRepository,
} from "@sigulon/database";
import { getOrgContext } from "@/lib/auth-helpers";
import { ACTIVE_ORG_COOKIE_NAME } from "@/lib/auth";
import {
  CARTESIA_STT_PROVIDER,
  CARTESIA_TTS_MODEL,
  CARTESIA_TTS_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId, userId } = await getOrgContext();

    const memberships = await OrganizationRepository.findUserMemberships(userId);

    let orgs = memberships.map((m) => ({
      id: m.organization._id.toString(),
      name: m.organization.name,
      role: m.role,
      created_at: m.organization.createdAt.toISOString(),
    }));

    if (orgs.length === 0 && orgId) {
      const currentOrg = await OrganizationRepository.findById(orgId);
      if (currentOrg) {
        orgs = [
          {
            id: currentOrg._id.toString(),
            name: currentOrg.name,
            role: "owner",
            created_at: currentOrg.createdAt.toISOString(),
          },
        ];
      }
    }

    return NextResponse.json({
      organizations: orgs,
      activeOrgId: orgId,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getOrgContext();
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Organization name is required." },
        { status: 400 }
      );
    }

    const { organization } = await OrganizationRepository.createOrganizationWithMember({
      name: name.trim(),
      userId,
    });

    // Initialize billing account
    await BillingRepository.ensureAccount(organization._id);

    // Starter agent
    const initialAgent = await AgentRepository.create({
      organizationId: organization._id,
      name: "General Receptionist",
      status: "active",
      config: {
        identity: {
          name: "Assistant",
          description: `Voice AI receptionist for ${organization.name}`,
          language: "hi",
        },
        instructions: {
          systemPrompt: `You are a professional voice AI assistant for ${organization.name}. Answer callers politely, understand their requirements, and offer to schedule an appointment or callback.`,
          greeting: `Hello! Thank you for calling ${organization.name}. How can I assist you today?`,
        },
        voice: {
          provider: CARTESIA_TTS_PROVIDER,
          voiceId: "126a0835-beea-4e77-a883-f66eabcf6dd4",
          model: CARTESIA_TTS_MODEL,
          speed: 1.0,
        },
        intelligence: {
          provider: "openrouter",
          model: OPENROUTER_DEFAULT_MODEL,
          temperature: 0.7,
        },
        speech: {
          sttProvider: CARTESIA_STT_PROVIDER,
          sttModel: "ink-whisper",
          ttsProvider: CARTESIA_TTS_PROVIDER,
          ttsModel: CARTESIA_TTS_MODEL,
        },
        telephony: {
          provider: "plivo",
        },
        tools: {
          enabledTools: ["check_availability", "pricing_lookup"],
        },
        settings: {
          interruptionHandling: true,
          silenceTimeout: 10,
          maxCallDuration: 600,
          recordingEnabled: true,
        },
      },
    });

    const response = NextResponse.json(
      {
        success: true,
        organization: {
          id: organization._id.toString(),
          name: organization.name,
        },
        initialAgent: {
          id: initialAgent._id.toString(),
          name: initialAgent.name,
        },
      },
      { status: 201 }
    );

    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, organization._id.toString(), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
