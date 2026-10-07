import { Call, CallOutcome, CallDirection, CallTranscriptLine } from "../types/sigulon";

function mapRawCallToCall(c: any): Call {
  const agentName =
    c.voice_agents?.name ||
    (c.agent_id && typeof c.agent_id === "object" ? c.agent_id.name : null) ||
    c.to_number ||
    "AI Agent";

  const transcript: CallTranscriptLine[] = Array.isArray(c.transcript)
    ? c.transcript.map((t: any) => ({
        speaker: t.role === "agent" ? "agent" : "user",
        text: t.text || "",
        time: t.timestamp || "0s",
      }))
    : [];

  const rawOutcome = (c.outcome || "").toLowerCase();
  let outcome: CallOutcome = "qualified";
  if (rawOutcome === "completed" || rawOutcome === "qualified") outcome = "qualified";
  else if (rawOutcome === "interested") outcome = "interested";
  else if (rawOutcome === "callback") outcome = "callback";
  else if (rawOutcome === "busy") outcome = "busy";
  else if (rawOutcome === "not_interested" || rawOutcome === "not interested") outcome = "not_interested";
  else if (rawOutcome === "failed" || rawOutcome === "unanswered") outcome = "failed";

  return {
    id: c.id || c._id,
    callerNumber: c.from_number || "Web Simulator",
    calleeNumber: c.to_number || "Inbound",
    direction: (c.direction as CallDirection) || "inbound",
    type: c.metadata?.is_web_test ? "instant" : c.campaign_id ? "campaign" : "inbound",
    agentId: typeof c.agent_id === "string" ? c.agent_id : c.agent_id?._id || "",
    agentName,
    campaignName: c.campaign_id ? "Campaign" : undefined,
    durationSeconds: c.duration_seconds ?? 0,
    outcome,
    costCredits: c.cost_credits ?? 0,
    recordingUrl: c.recording_url || undefined,
    transcript,
    aiSummary: c.summary || "Call completed successfully.",
    keyTakeaways: c.summary ? [c.summary] : ["Call completed successfully."],
    latencyMs: {
      livekit: 25,
      stt: 140,
      llm: 190,
      tts: 90,
    },
    createdAt: c.created_at || c.createdAt || new Date().toISOString(),
  };
}

export async function getCalls(filters?: {
  agentId?: string;
  outcome?: CallOutcome | "all";
  direction?: CallDirection | "all";
  search?: string;
}): Promise<Call[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.agentId && filters.agentId !== "all") {
      params.set("agent_id", filters.agentId);
    }
    if (filters?.outcome && filters.outcome !== "all") {
      params.set("outcome", filters.outcome);
    }
    if (filters?.direction && filters.direction !== "all") {
      params.set("direction", filters.direction);
    }

    const url = `/api/calls${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[api/calls] Fetch returned status", res.status);
      return [];
    }

    const data = await res.json();
    const rawCalls: any[] = data.calls || [];
    let result = rawCalls.map(mapRawCallToCall);

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.calleeNumber.toLowerCase().includes(q) ||
          c.callerNumber.toLowerCase().includes(q) ||
          c.agentName.toLowerCase().includes(q) ||
          c.aiSummary.toLowerCase().includes(q)
      );
    }

    return result;
  } catch (err) {
    console.error("[api/calls] getCalls error:", err);
    return [];
  }
}

export async function getCallById(id: string): Promise<Call | null> {
  try {
    const calls = await getCalls();
    return calls.find((c) => c.id === id) || null;
  } catch (err) {
    console.error(`[api/calls] getCallById error for ${id}:`, err);
    return null;
  }
}

export async function recordNewCall(data: Partial<Call>): Promise<Call> {
  const payload = {
    agentId: data.agentId,
    toNumber: data.calleeNumber,
    fromNumber: data.callerNumber,
    metadata: {
      is_web_test: data.type === "instant",
      summary: data.aiSummary,
    },
  };

  const res = await fetch("/api/calls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to record call" }));
    throw new Error(err.error || "Failed to record call");
  }

  const result = await res.json();
  return mapRawCallToCall(result.call);
}
