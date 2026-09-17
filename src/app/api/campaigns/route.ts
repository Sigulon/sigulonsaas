import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import {
  CampaignRepository,
  ContactRepository,
  AgentRepository,
} from "@sigulon/database";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

type PopulatedAgent = { _id: { toString(): string }; name: string };

export async function GET() {
  try {
    const { orgId } = await getOrgContext();


    const campaigns = await CampaignRepository.findByOrg(orgId);

    const formatted = campaigns.map((c) => ({
      id: c._id.toString(),
      org_id: c.organizationId.toString(),
      agent_id: c.agentId
        ? typeof c.agentId === "object" && "_id" in c.agentId
          ? (c.agentId as unknown as PopulatedAgent)._id.toString()
          : String(c.agentId)
        : "",
      name: c.name,
      status: c.status,
      total_contacts: c.totalContacts,
      calls_completed: c.callsCompleted,
      concurrency_limit: c.concurrencyLimit,
      retry_config: c.retryConfig,
      voice_agents: c.agentId && typeof c.agentId === "object"
        ? (() => {
            const agent = c.agentId as unknown as PopulatedAgent;
            return { id: agent._id?.toString(), name: agent.name };
          })()
        : undefined,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
    }));

    return NextResponse.json({ campaigns: formatted });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await getOrgContext();
    const body = await req.json();

    const { name, agentId, contacts = [], concurrencyLimit = 5 } = body;

    if (!name || !agentId) {
      return NextResponse.json(
        { error: "Campaign name and agentId are required" },
        { status: 400 }
      );
    }

    const agent = await AgentRepository.findById(agentId, orgId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Process and normalize contacts
    const normalizedContacts: Array<{
      name?: string;
      phone: string;
      normalizedPhone: string;
      email?: string;
      company?: string;
      customFields?: Record<string, unknown>;
    }> = [];

    const seen = new Set<string>();
    for (const c of contacts as {
      name?: string;
      phone_number: string;
      email?: string;
      company?: string;
      metadata?: Record<string, unknown>;
    }[]) {
      if (!c?.phone_number) continue;
      const normalized = normalizePhone(c.phone_number);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        normalizedContacts.push({
          name: c.name || "",
          phone: c.phone_number,
          normalizedPhone: normalized,
          email: c.email || "",
          company: c.company || "",
          customFields: c.metadata || {},
        });
      }
    }

    // Bulk upsert into contacts collection
    const savedContacts = await ContactRepository.bulkUpsert(
      orgId,
      normalizedContacts
    );

    const contactIds = savedContacts.map((c) => c._id);

    // Create campaign with contacts
    const campaign = await CampaignRepository.createCampaignWithContacts({
      organizationId: orgId,
      agentId: agent._id,
      name,
      contactIds,
      concurrencyLimit,
    });

    return NextResponse.json(
      {
        campaign: {
          id: campaign._id.toString(),
          org_id: campaign.organizationId.toString(),
          name: campaign.name,
          status: campaign.status,
          total_contacts: campaign.totalContacts,
          calls_completed: campaign.callsCompleted,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
