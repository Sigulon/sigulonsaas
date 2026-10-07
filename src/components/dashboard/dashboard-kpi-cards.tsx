"use client";

import { useEffect, useState } from "react";
import { Bot, PhoneCall, CheckCircle2, UserCheck, Clock, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardKpiCards() {
  const [data, setData] = useState<{
    agentsCount: number;
    callsCount: number;
    connectedCount: number;
    qualifiedCount: number;
    minutesUsed: number;
    creditsBalance: number;
    connectionRate: number;
  }>({
    agentsCount: 0,
    callsCount: 0,
    connectedCount: 0,
    qualifiedCount: 0,
    minutesUsed: 0,
    creditsBalance: 50,
    connectionRate: 100,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [statsRes, agentsRes, billingRes, callsRes] = await Promise.all([
          fetch("/api/dashboard/stats", { cache: "no-store" }),
          fetch("/api/agents", { cache: "no-store" }),
          fetch("/api/billing/summary", { cache: "no-store" }),
          fetch("/api/calls", { cache: "no-store" }),
        ]);

        const statsData = statsRes.ok ? await statsRes.json() : {};
        const agentsData = agentsRes.ok ? await agentsRes.json() : {};
        const billingData = billingRes.ok ? await billingRes.json() : {};
        const callsData = callsRes.ok ? await callsRes.json() : {};

        const stats = statsData.stats || {};
        const agents = agentsData.agents || [];
        const calls: any[] = callsData.calls || [];

        const totalCalls = stats.total_calls ?? calls.length;
        const connectedCalls = stats.answered_calls ?? calls.filter((c) => c.status === "completed").length;
        const qualifiedCount = calls.filter((c) => (c.outcome || "").toLowerCase() === "completed" || (c.outcome || "").toLowerCase() === "qualified").length;

        const totalDurationSecs = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
        const minutesUsed = Math.ceil(totalDurationSecs / 60);

        setData({
          agentsCount: agents.length,
          callsCount: totalCalls,
          connectedCount: connectedCalls,
          qualifiedCount,
          minutesUsed,
          creditsBalance: billingData.balance ?? 50,
          connectionRate: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 100,
        });
      } catch (err) {
        console.error("[dashboard-kpi] Failed to load actual KPIs:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const kpis = [
    {
      title: "AI Agents",
      value: loading ? "..." : String(data.agentsCount),
      change: `${data.agentsCount} deployed`,
      trend: "neutral",
      icon: Bot,
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/60",
    },
    {
      title: "Total Calls",
      value: loading ? "..." : String(data.callsCount),
      change: `${data.callsCount} processed`,
      trend: "positive",
      icon: PhoneCall,
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/60",
    },
    {
      title: "Connected Calls",
      value: loading ? "..." : String(data.connectedCount),
      change: `${data.connectionRate}% connection rate`,
      trend: "positive",
      icon: CheckCircle2,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/60",
    },
    {
      title: "Qualified Leads",
      value: loading ? "..." : String(data.qualifiedCount),
      change: `${data.callsCount > 0 ? Math.round((data.qualifiedCount / data.callsCount) * 100) : 0}% conversion`,
      trend: "positive",
      icon: UserCheck,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/60",
    },
    {
      title: "Minutes Used",
      value: loading ? "..." : String(data.minutesUsed),
      change: "LiveKit voice runtime",
      trend: "neutral",
      icon: Clock,
      iconColor: "text-gray-600 dark:text-neutral-400",
      bgColor: "bg-gray-100 dark:bg-neutral-800",
    },
    {
      title: "Credits Balance",
      value: loading ? "..." : `₹${data.creditsBalance}`,
      change: "Active ledger balance",
      trend: "positive",
      icon: Coins,
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/60",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={idx}
            className="hover:border-gray-300 dark:hover:border-neutral-700 transition-all hover:shadow-xs"
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 dark:text-neutral-400 truncate">
                  {kpi.title}
                </span>
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${kpi.bgColor} ${kpi.iconColor}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-mono">
                  {kpi.value}
                </div>
                <div
                  className={`text-[11px] font-medium mt-1 truncate ${
                    kpi.trend === "positive"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-gray-500 dark:text-neutral-400"
                  }`}
                >
                  {kpi.change}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
