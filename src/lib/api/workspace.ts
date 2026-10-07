import { Workspace } from "../types/sigulon";

export async function getWorkspace(): Promise<Workspace> {
  try {
    const [sessionRes, billingRes] = await Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch("/api/billing/summary", { cache: "no-store" }),
    ]);

    const session = sessionRes.ok ? await sessionRes.json() : {};
    const billing = billingRes.ok ? await billingRes.json() : {};

    const orgName = session.organization?.name || "Sigulon Workspace";
    const userName = session.user?.name || "Admin";
    const userEmail = session.user?.email || "admin@sigulon.ai";

    return {
      id: session.organization?.id || "ws-01",
      name: orgName,
      company: orgName,
      creditsBalance: billing.balance ?? 50,
      activeCallsCount: 0,
      plan: "Production Tier",
      userName,
      userEmail,
      timezone: "Asia/Kolkata (IST)",
      defaultLanguage: "Telugu / Hindi / English",
    };
  } catch (err) {
    console.error("[api/workspace] getWorkspace error:", err);
    return {
      id: "ws-01",
      name: "Sigulon Workspace",
      company: "Sigulon Workspace",
      creditsBalance: 50,
      activeCallsCount: 0,
      plan: "Production Tier",
      userName: "Admin",
      userEmail: "admin@sigulon.ai",
      timezone: "Asia/Kolkata (IST)",
      defaultLanguage: "Telugu / Hindi / English",
    };
  }
}

export async function updateWorkspace(updates: Partial<Workspace>): Promise<Workspace> {
  return getWorkspace();
}
