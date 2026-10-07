import { Agent, AgentStatus, AgentChannel, FlowNode } from "../types/sigulon";

function mapRawAgentToAgent(ag: any): Agent {
  const bundle = ag.bundle || ag.config?.bundle || {};
  const exported = bundle.exported_from || {};
  const sections = Array.isArray(bundle.sections) ? bundle.sections : [];

  const flowNodes: FlowNode[] = sections.map((s: any) => ({
    id: s.section_key || `sec-${s.order}`,
    key: s.section_key,
    label: s.label || s.section_key,
    order: s.order || 1,
    nodeType: s.node_type || "llm",
    prompt: s.prompt || "",
    edges: s.edges
      ? s.edges.map((e: any) => ({
          toKey: e.to_key,
          condition: e.condition || "",
        }))
      : null,
  }));

  const langCode = exported.language || ag.language || ag.config?.identity?.language || "te-IN";
  let langLabel = "Telugu";
  if (langCode.startsWith("hi")) langLabel = "Hindi";
  else if (langCode.startsWith("en")) langLabel = "English";
  else if (langCode.startsWith("ta")) langLabel = "Tamil";

  const status: AgentStatus =
    ag.status === "active" ? "ready" : ag.status === "paused" ? "paused" : ag.status === "draft" ? "draft" : "ready";

  const phone =
    ag.phone_numbers?.[0]?.phone_number ||
    ag.phone_numbers?.[0]?.phoneNumber ||
    ag.phoneNumber ||
    "";

  return {
    id: ag.id || ag._id,
    name: ag.name || "AI Agent",
    role: exported.employee_role || ag.description?.slice(0, 45) || "Voice Assistant",
    status,
    channel: (exported.mode as AgentChannel) || "all",
    language: langLabel,
    languageCode: langCode,
    voiceProvider: "Cartesia",
    voiceName: "Sonic 3.6",
    voiceId: ag.voice_id || ag.config?.voice?.voiceId || "126a0835-beea-4e77-a883-f66eabcf6dd4",
    speed: ag.config?.voice?.speed ?? 1.0,
    stability: 0.8,
    pitch: 0.0,
    phoneNumber: phone,
    phoneId: ag.phone_numbers?.[0]?.id || "",
    callsToday: ag.callsToday || 0,
    leadsCount: ag.leadsCount || 0,
    qualifiedCount: ag.qualifiedCount || 0,
    totalCalls: ag.totalCalls || 0,
    conversionRate: ag.conversionRate || 0,
    avgDurationSeconds: ag.avgDurationSeconds || 0,
    creditsUsed: ag.creditsUsed || 0,
    description: ag.description || "",
    industry: (exported.industry as any) || "Real Estate",
    useCase: ag.description || "",
    objective: ag.description || "",
    personality: "Warm, professional and natural",
    openingMessage: ag.introduction || ag.config?.instructions?.greeting || bundle.first_response || "నమస్తే అండి",
    instructions: ag.system_prompt || ag.config?.instructions?.systemPrompt || "",
    qualificationCriteria: "",
    forbiddenRules: "",
    flowNodes,
    actions: {
      transferCall: true,
      createCrmLead: true,
    },
    preCallVariables: bundle.variables?.map((v: any) => v.key) || ["phone", "lead_name"],
    createdAt: ag.created_at || ag.createdAt || new Date().toISOString(),
    updatedAt: ag.updated_at || ag.updatedAt || new Date().toISOString(),
  };
}

export async function getAgents(filters?: {
  status?: AgentStatus | "all";
  channel?: AgentChannel | "all";
  search?: string;
}): Promise<Agent[]> {
  try {
    const res = await fetch("/api/agents", { cache: "no-store" });
    if (!res.ok) {
      console.warn("[api/agents] Fetch returned status", res.status);
      return [];
    }
    const data = await res.json();
    const rawAgents: any[] = data.agents || [];
    let result = rawAgents.map(mapRawAgentToAgent);

    if (filters?.status && filters.status !== "all") {
      result = result.filter((a) => a.status === filters.status);
    }

    if (filters?.channel && filters.channel !== "all") {
      result = result.filter(
        (a) => a.channel === filters.channel || a.channel === "all"
      );
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          a.language.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      );
    }

    return result;
  } catch (err) {
    console.error("[api/agents] getAgents error:", err);
    return [];
  }
}

export async function getAgentById(id: string): Promise<Agent | null> {
  try {
    const res = await fetch(`/api/agents/${id}`, { cache: "no-store" });
    if (!res.ok) {
      // Fallback: search in getAgents
      const all = await getAgents();
      return all.find((a) => a.id === id) || null;
    }
    const data = await res.json();
    if (!data.agent) return null;
    return mapRawAgentToAgent(data.agent);
  } catch (err) {
    console.error(`[api/agents] getAgentById error for ${id}:`, err);
    return null;
  }
}

export async function createAgent(data: Partial<Agent>): Promise<Agent> {
  const payload = {
    name: data.name || "Custom Agent",
    voiceId: data.voiceId || "126a0835-beea-4e77-a883-f66eabcf6dd4",
    language: data.languageCode || "te-IN",
    systemPrompt: data.instructions || "You are a professional AI voice agent.",
    introduction: data.openingMessage || "నమస్తే అండి",
    description: data.description || "",
    status: data.status === "paused" ? "paused" : data.status === "draft" ? "draft" : "active",
  };

  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create agent" }));
    throw new Error(err.error || "Failed to create agent");
  }

  const result = await res.json();
  return mapRawAgentToAgent(result.agent);
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | null> {
  const patchPayload: Record<string, unknown> = {};

  if (updates.name) patchPayload.name = updates.name;
  if (updates.status) {
    patchPayload.status = updates.status === "ready" ? "active" : updates.status;
  }
  if (updates.openingMessage) patchPayload.introduction = updates.openingMessage;
  if (updates.instructions) patchPayload.systemPrompt = updates.instructions;
  if (updates.speed !== undefined || updates.voiceId) {
    patchPayload.settings = {
      voice: {
        speed: updates.speed ?? 1.0,
        voiceId: updates.voiceId,
      },
    };
  }

  const res = await fetch(`/api/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patchPayload),
  });

  if (!res.ok) {
    console.error(`[api/agents] updateAgent failed for ${id}`);
    return null;
  }

  const data = await res.json();
  return mapRawAgentToAgent(data.agent);
}

export async function toggleAgentStatus(id: string): Promise<Agent | null> {
  const current = await getAgentById(id);
  if (!current) return null;

  const nextStatus: AgentStatus = current.status === "ready" ? "paused" : "ready";
  return updateAgent(id, { status: nextStatus });
}

export async function duplicateAgent(id: string): Promise<Agent | null> {
  const current = await getAgentById(id);
  if (!current) return null;

  return createAgent({
    ...current,
    name: `${current.name} (Copy)`,
  });
}
