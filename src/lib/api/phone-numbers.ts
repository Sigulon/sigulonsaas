import { PhoneNumber } from "../types/sigulon";

function mapRawNumberToPhoneNumber(n: any): PhoneNumber {
  return {
    id: n.id,
    number: n.phoneNumber,
    country: "India",
    city: n.region === "in-mumbai" ? "Mumbai" : "Hyderabad",
    provider: "Plivo",
    assignedAgentId: n.agentId || undefined,
    assignedAgentName: n.agentName || undefined,
    type: n.direction === "both" ? "two_way" : n.direction || "two_way",
    status: n.status || "active",
    monthlyRentalInr: 499,
    callsHandled: 0,
    minutesUsed: 0,
    createdAt: n.createdAt || new Date().toISOString(),
  };
}

export async function getPhoneNumbers(): Promise<PhoneNumber[]> {
  try {
    const res = await fetch("/api/phone-numbers", { cache: "no-store" });
    if (!res.ok) return [];

    const data = await res.json();
    const raw: any[] = data.phoneNumbers || [];
    return raw.map(mapRawNumberToPhoneNumber);
  } catch (err) {
    console.error("[api/phone-numbers] getPhoneNumbers error:", err);
    return [];
  }
}

export async function buyPhoneNumber(data: {
  city: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
}): Promise<PhoneNumber> {
  const cityCodeMap: Record<string, string> = {
    Bangalore: "+91804",
    Hyderabad: "+91404",
    Mumbai: "+91225",
    Delhi: "+91114",
    Chennai: "+91444",
  };

  const prefix = cityCodeMap[data.city] || "+91404";
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const phoneNumber = `${prefix}${randomSuffix}`;

  const res = await fetch("/api/phone-numbers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phoneNumber,
      agentId: data.assignedAgentId,
      provider: "plivo",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to register number" }));
    throw new Error(err.error || "Failed to register number");
  }

  const result = await res.json();
  return mapRawNumberToPhoneNumber(result.phoneNumber);
}

export async function updateNumberRouting(
  id: string,
  agentId: string,
  agentName: string
): Promise<PhoneNumber | null> {
  return null;
}
