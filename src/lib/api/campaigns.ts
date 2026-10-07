import { Campaign, CampaignStatus } from "../types/sigulon";

function mapRawCampaignToCampaign(c: any): Campaign {
  return {
    id: c.id,
    name: c.name,
    description: c.description || "",
    agentId: c.agent_id || "",
    agentName: c.agent?.name || c.voice_agents?.name || "AI Agent",
    leadsCount: c.total_contacts || 0,
    callsAttempted: c.calls_completed || 0,
    callsConnected: c.calls_completed || 0,
    qualifiedLeads: 0,
    status: (c.status as CampaignStatus) || "draft",
    progress: c.total_contacts ? Math.round(((c.calls_completed || 0) / c.total_contacts) * 100) : 0,
    callerId: "+91 80 4719 3320",
    maxConcurrency: c.concurrency_limit || 5,
    callingHours: { start: "10:00", end: "19:00" },
    timezone: "Asia/Kolkata",
    retryAttempts: c.retry_config?.max_retries || 2,
    retryDelayMinutes: c.retry_config?.retry_delay_seconds ? Math.round(c.retry_config.retry_delay_seconds / 60) : 60,
    dailyLimit: 300,
    maxAttemptsPerLead: 3,
    createdAt: c.created_at || new Date().toISOString(),
  };
}

export async function getCampaigns(filters?: {
  status?: CampaignStatus | "all";
  agentId?: string;
  search?: string;
}): Promise<Campaign[]> {
  try {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (!res.ok) return [];

    const data = await res.json();
    const raw: any[] = data.campaigns || [];
    let result = raw.map(mapRawCampaignToCampaign);

    if (filters?.status && filters.status !== "all") {
      result = result.filter((c) => c.status === filters.status);
    }

    if (filters?.agentId && filters.agentId !== "all") {
      result = result.filter((c) => c.agentId === filters.agentId);
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.agentName.toLowerCase().includes(q)
      );
    }

    return result;
  } catch (err) {
    console.error("[api/campaigns] getCampaigns error:", err);
    return [];
  }
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const campaigns = await getCampaigns();
  return campaigns.find((c) => c.id === id) || null;
}

export async function createCampaign(data: Partial<Campaign>): Promise<Campaign> {
  const payload = {
    name: data.name || "New Campaign",
    agentId: data.agentId,
    concurrencyLimit: data.maxConcurrency || 5,
    contacts: [],
  };

  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create campaign" }));
    throw new Error(err.error || "Failed to create campaign");
  }

  const result = await res.json();
  return mapRawCampaignToCampaign(result.campaign);
}

export async function toggleCampaignStatus(id: string): Promise<Campaign | null> {
  const current = await getCampaignById(id);
  if (!current) return null;
  current.status = current.status === "running" ? "paused" : "running";
  return current;
}
