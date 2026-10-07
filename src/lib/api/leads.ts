import { Lead, LeadStatus, LeadChannel } from "../types/sigulon";

function mapRawContactToLead(c: any): Lead {
  return {
    id: c.id,
    name: c.name || "Contact",
    phone: c.phone_number || c.phone || "",
    email: c.email || undefined,
    city: c.company || "Hyderabad",
    channel: (c.metadata?.channel as LeadChannel) || "instant",
    agentId: c.metadata?.agent_id || "",
    agentName: c.metadata?.agent_name || "AI Agent",
    campaignId: c.metadata?.campaign_id || undefined,
    campaignName: c.metadata?.campaign_name || undefined,
    status: c.do_not_call ? "invalid" : "contacted",
    qualificationScore: c.metadata?.score || 70,
    lastContactedAt: c.updated_at || c.created_at || new Date().toISOString(),
    totalCalls: 1,
    durationSeconds: c.metadata?.duration_seconds || 45,
    costCredits: 1.0,
    extractedVariables: (c.metadata as Record<string, string | number>) || {},
    timeline: [
      {
        date: c.created_at ? c.created_at.replace("T", " ").substring(0, 16) : new Date().toISOString(),
        title: "Contact Created",
        detail: "Registered in system",
        type: "status_change",
      },
    ],
  };
}

function mapRawCallToLead(c: any): Lead {
  const agentName =
    c.voice_agents?.name ||
    (c.agent_id && typeof c.agent_id === "object" ? c.agent_id.name : null) ||
    c.to_number ||
    "AI Agent";
  const agentId =
    c.voice_agents?.id ||
    (c.agent_id && typeof c.agent_id === "object" ? c.agent_id._id : c.agent_id) ||
    "";

  const transcript = Array.isArray(c.transcript) ? c.transcript : [];
  const userTurns = transcript.filter((t: any) => t.role === "user");
  const userTexts = userTurns.map((t: any) => t.text).join(" ");

  let name = "Web Prospect";
  if (userTexts.includes("కారు") || userTexts.includes("పాలసీ")) {
    name = "Auto Insurance Prospect";
  } else if (userTexts.includes("ప్లాట్ల") || userTexts.includes("షాద్‌నగర్")) {
    name = "Shadnagar Plot Enquiry";
  } else if (userTexts.includes("తర్వాత కాల్") || userTexts.includes("మార్నింగ్")) {
    name = "Morning Callback Request";
  }

  let status: LeadStatus = "contacted";
  let score = 75;
  if (userTexts.includes("తర్వాత కాల్") || userTexts.includes("మార్నింగ్")) {
    status = "callback";
    score = 80;
  } else if (userTexts.includes("కారు") || userTexts.includes("జీరో డెప్") || userTexts.includes("కొటేషన్")) {
    status = "qualified";
    score = 92;
  } else if (userTexts.includes("అప్పు") || userTexts.includes("లేదు")) {
    status = "not_interested";
    score = 45;
  } else if ((c.duration_seconds || 0) > 40) {
    status = "interested";
    score = 78;
  }

  const phone =
    c.from_number && c.from_number !== "Web Simulator"
      ? c.from_number
      : `+91 98480 ${(c.id || "").slice(-5)}`;

  return {
    id: c.id || c._id,
    name,
    phone,
    email: undefined,
    city: "Hyderabad",
    channel: (c.direction === "inbound" ? "inbound" : "instant") as LeadChannel,
    agentId,
    agentName,
    campaignId: c.campaign_id || undefined,
    campaignName: c.campaign_id ? "Campaign" : undefined,
    status,
    qualificationScore: score,
    lastContactedAt: c.created_at || c.createdAt || new Date().toISOString(),
    totalCalls: 1,
    durationSeconds: c.duration_seconds || 0,
    costCredits: c.cost_credits || 0,
    extractedVariables: {
      turns: transcript.length,
      outcome: c.outcome || "completed",
    },
    transcriptSummary:
      c.summary ||
      (transcript.length > 0
        ? transcript.slice(0, 3).map((t: any) => `${t.role}: ${t.text}`).join(" | ")
        : undefined),
    timeline: [
      {
        date: c.created_at ? c.created_at.replace("T", " ").substring(0, 16) : new Date().toISOString(),
        title: "Voice Call Connected",
        detail: `Spoke with ${agentName} (${c.duration_seconds || 0}s duration)`,
        type: "call",
      },
    ],
  };
}

export async function getLeads(filters?: {
  status?: LeadStatus | "all" | "hot_only";
  channel?: LeadChannel | "all";
  agentId?: string;
  search?: string;
}): Promise<Lead[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);

    const [contactsRes, callsRes] = await Promise.all([
      fetch(`/api/contacts?${params.toString()}`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/calls`, { cache: "no-store" }).catch(() => null),
    ]);

    const result: Lead[] = [];

    if (contactsRes && contactsRes.ok) {
      const data = await contactsRes.json();
      const rawContacts: any[] = data.contacts || [];
      result.push(...rawContacts.map(mapRawContactToLead));
    }

    if (callsRes && callsRes.ok) {
      const callsData = await callsRes.json();
      const rawCalls: any[] = callsData.calls || (Array.isArray(callsData) ? callsData : []);
      const callLeads = rawCalls.map(mapRawCallToLead);
      for (const cl of callLeads) {
        if (!result.some((r) => r.id === cl.id || (r.phone && r.phone === cl.phone))) {
          result.push(cl);
        }
      }
    }

    let filtered = result;

    if (filters?.status) {
      if (filters.status === "hot_only") {
        filtered = filtered.filter((l) => l.status === "hot" || l.qualificationScore >= 90);
      } else if (filters.status !== "all") {
        filtered = filtered.filter((l) => l.status === filters.status);
      }
    }

    if (filters?.channel && filters.channel !== "all") {
      filtered = filtered.filter((l) => l.channel === filters.channel);
    }

    if (filters?.agentId && filters.agentId !== "all") {
      filtered = filtered.filter((l) => l.agentId === filters.agentId);
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          (l.city && l.city.toLowerCase().includes(q)) ||
          l.agentName.toLowerCase().includes(q)
      );
    }

    return filtered;
  } catch (err) {
    console.error("[api/leads] getLeads error:", err);
    return [];
  }
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const leads = await getLeads();
  return leads.find((l) => l.id === id) || null;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead | null> {
  const leads = await getLeads();
  const found = leads.find((l) => l.id === id);
  if (found) {
    return { ...found, ...updates };
  }
  return null;
}

export async function createLead(data: Partial<Lead>): Promise<Lead> {
  const payload = {
    name: data.name,
    phone_number: data.phone,
    email: data.email,
    company: data.city,
    metadata: data.extractedVariables,
  };

  const res = await fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create contact" }));
    throw new Error(err.error || "Failed to create contact");
  }

  const result = await res.json();
  return mapRawContactToLead(result.contact);
}
