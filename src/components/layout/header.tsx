"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Filter, LogOut, Building2, User } from "lucide-react";

const validDirections = new Set(["all", "inbound", "outbound"]);
const validPeriods = new Set(["today", "7d", "30d"]);

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Operations", subtitle: "Real-time call center operations and KPIs" },
  "/agents": { title: "Voice Agents", subtitle: "Configure prompts, voices, and agent capabilities" },
  "/agents/new": { title: "Create Voice Agent", subtitle: "Build and deploy a new conversational voice agent" },
  "/campaigns": { title: "Campaigns", subtitle: "Batch outbound dialing campaigns and lists" },
  "/calls": { title: "Call Logs", subtitle: "Inspect call history, recordings, transcripts, and telemetry" },
  "/contacts": { title: "Contacts", subtitle: "Manage callee contacts, metadata, and DNC lists" },
  "/phone-numbers": { title: "Phone Numbers", subtitle: "Inbound and outbound telephony lines" },
  "/settings": { title: "Settings", subtitle: "Manage organization profile and preferences" },
  "/settings/billing": { title: "Billing & Credits", subtitle: "Credit balance, usage ledger, and payment plans" },
  "/settings/team": { title: "Team Members", subtitle: "Invite and manage team members and roles" },
  "/settings/telephony": { title: "Telephony Credentials", subtitle: "Configure Plivo and LiveKit SIP trunk credentials" },
};

interface SessionData {
  user: { id: string; email: string; name: string } | null;
  organization: { id: string; name: string } | null;
  memberships: { id: string; name: string; role: string }[];
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setSession(data);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    try {
      const res = await fetch("/api/organizations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch {}
  };

  const direction = validDirections.has(searchParams.get("direction") ?? "")
    ? searchParams.get("direction")!
    : "all";
  const period = validPeriods.has(searchParams.get("period") ?? "")
    ? searchParams.get("period")!
    : "7d";

  function updateFilter(name: "direction" | "period", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(name, value);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }

  const pageInfo = PAGE_TITLES[pathname] || {
    title: pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Dashboard",
    subtitle: "Sigulon Voice AI Platform",
  };

  return (
    <header className="sticky top-0 z-20 flex min-h-16 w-full flex-col justify-center gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      {pathname === "/dashboard" ? (
        <div className="flex items-center gap-2 text-gray-900">
          <span className="grid size-8 place-content-center rounded-lg bg-blue-50 text-blue-600">
            <Filter className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-sm font-bold tracking-tight">Operations filters</span>
            <span className="block text-[11px] text-gray-500">Refine the recent call log by direction and time period.</span>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-base font-bold tracking-tight text-gray-900 capitalize">{pageInfo.title}</h1>
          <p className="text-xs text-gray-500">{pageInfo.subtitle}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {pathname === "/dashboard" && (
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="operation-direction">Call direction</label>
            <select
              id="operation-direction"
              value={direction}
              onChange={(event) => updateFilter("direction", event.target.value)}
              className="h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All operations</option>
              <option value="outbound">Outbound calls</option>
              <option value="inbound">Inbound calls</option>
            </select>

            <label className="sr-only" htmlFor="operation-period">Time period</label>
            <select
              id="operation-period"
              value={period}
              onChange={(event) => updateFilter("period", event.target.value)}
              className="h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
        )}

        {/* Organization Badge / Selector */}
        {session?.organization && (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
            <Building2 className="h-3.5 w-3.5 text-gray-400" />
            {session.memberships.length > 1 ? (
              <select
                value={session.organization.id}
                onChange={(e) => handleSwitchOrg(e.target.value)}
                className="bg-transparent font-medium text-gray-800 outline-none cursor-pointer"
                title="Switch Organization"
              >
                {session.memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium text-gray-800">{session.organization.name}</span>
            )}
          </div>
        )}

        {/* User Profile & Sign Out */}
        {session?.user && (
          <div className="flex items-center gap-2 pl-1 border-l border-gray-200">
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="grid size-6 place-content-center rounded-full bg-blue-100 text-blue-700 font-semibold text-[10px]">
                {session.user.name ? session.user.name.charAt(0).toUpperCase() : <User className="h-3 w-3" />}
              </span>
              <span className="hidden sm:inline font-medium text-gray-800 truncate max-w-[120px]">
                {session.user.name || session.user.email}
              </span>
            </div>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-red-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{isLoggingOut ? "..." : "Sign out"}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
