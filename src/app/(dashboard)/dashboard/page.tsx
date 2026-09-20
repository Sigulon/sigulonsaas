"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { CallsChart } from "@/components/dashboard/calls-chart";
import { CallsTable } from "@/components/calls/calls-table";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CallRecord, VoiceAgent } from "@/lib/types";
import {
  AlertTriangle,
  Bot,
  Megaphone,
  Mic,
  PhoneCall,
  PhoneIncoming,
  Plus,
  Users,
  Wallet,
} from "lucide-react";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState({
    total_calls: 0,
    answered_calls: 0,
    answer_rate_percentage: 0,
    avg_duration_seconds: 0,
    total_credits_spent: 0,
    chart_data: [] as { date: string; calls: number; answered: number }[],
  });

  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [creditsAvailable, setCreditsAvailable] = useState<number | null>(null);
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const selectedDirection = searchParams.get("direction");
  const selectedPeriod = searchParams.get("period");
  const operationDirection = selectedDirection === "inbound" || selectedDirection === "outbound"
    ? selectedDirection
    : "all";
  const operationPeriod = selectedPeriod === "today" || selectedPeriod === "30d"
    ? selectedPeriod
    : "7d";

  const loadData = useCallback(async () => {
    try {
      const statsParams = new URLSearchParams();
      if (operationDirection !== "all") statsParams.set("direction", operationDirection);
      if (operationPeriod !== "7d") statsParams.set("period", operationPeriod);
      const statsQuery = statsParams.toString() ? `?${statsParams.toString()}` : "";
      const callsParams = new URLSearchParams({ limit: "10" });
      if (operationDirection !== "all") callsParams.set("direction", operationDirection);
      const [statsRes, callsRes, agentsRes, sessionRes, billingRes] = await Promise.all([
        fetch(`/api/dashboard/stats${statsQuery}`),
        fetch(`/api/calls?${callsParams.toString()}`),
        fetch("/api/agents"),
        fetch("/api/auth/session"),
        fetch("/api/billing/summary"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.stats) setStats(statsData.stats);
      }

      if (callsRes.ok) {
        const callsData = await callsRes.json();
        setRecentCalls(callsData.calls || []);
      }

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData.agents || []);
      }

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setUserName(sessionData.user?.name || sessionData.user?.email || null);
      }

      if (billingRes.ok) {
        const billingData = await billingRes.json();
        setCreditsAvailable(
          typeof billingData.available === "number" ? billingData.available : null
        );
      }
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    }
  }, [operationDirection, operationPeriod]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    loadData();
  }, [loadData]);

  const attentionCalls = recentCalls.filter(
    (call) => call.status === "failed" || call.outcome === "callback_requested"
  ).slice(0, 5);

  const showTrialBanner = creditsAvailable !== null && creditsAvailable <= 5;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
          {greeting()}{userName ? `, ${userName}` : ""} — your team is on shift
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Agents working today: {agents.filter((a) => a.status === "active").length} of {agents.length}
          {" · "}Calls in view: {recentCalls.length}
        </p>
      </div>

      {/* Trial banner, only when credits run low */}
      {showTrialBanner && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-[20px] border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Low balance:</strong> {creditsAvailable?.toFixed(2)} credits left.
              Top up so your agents keep dialing.
            </span>
          </p>
          <Link href="/settings/billing">
            <Button size="sm">Add credits</Button>
          </Link>
        </div>
      )}

      {/* Builder hero */}
      <section className="overflow-hidden rounded-[20px] bg-[#1E1433] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-violet-200">
              <Mic className="h-3.5 w-3.5" />
              Agent studio
            </span>
            <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
              Describe your business, get a voice agent
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-violet-100/80">
              Tell Sigulon what you do and the call outcome you want. We design
              the voice flow, questions, prompts, and safeguards for you.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Hindi", "Telugu", "Tamil", "Kannada", "Indian English"].map((language) => (
                <span key={language} className="rounded-full bg-white/10 px-3 py-1 text-xs text-violet-100">
                  {language}
                </span>
              ))}
            </div>
            <div className="mt-5">
              <Link href="/agents/builder">
                <Button variant="gold">Build an agent</Button>
              </Link>
            </div>
          </div>
          <div className="grid size-24 shrink-0 place-content-center rounded-full bg-violet-600 shadow-lg shadow-violet-900/50 lg:size-32">
            <Mic className="h-10 w-10 text-white lg:h-14 lg:w-14" />
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { href: "/agents/builder", icon: Plus, label: "New agent" },
          { href: "/campaigns", icon: Megaphone, label: "New campaign" },
          { href: "/settings/billing", icon: Wallet, label: creditsAvailable !== null ? `${creditsAvailable.toFixed(0)} credits left` : "Add credits" },
          { href: "/phone-numbers", icon: PhoneIncoming, label: "Numbers" },
          { href: "/contacts", icon: Users, label: "Leads" },
          { href: "/calls", icon: PhoneCall, label: "Call log" },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex items-center gap-2.5 rounded-2xl border border-stone-200/70 bg-white p-3.5 text-sm font-medium text-stone-800 shadow-[0_8px_30px_rgba(30,20,60,0.08)] transition-colors hover:border-violet-300 hover:text-violet-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
          >
            <action.icon className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="truncate">{action.label}</span>
          </Link>
        ))}
      </section>

      {/* KPI cards */}
      <KpiCards stats={stats} />

      {/* Calls chart */}
      <CallsChart data={stats.chart_data} />

      {/* Team list + attention */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[20px] border border-stone-200/70 bg-white p-6 shadow-[0_8px_30px_rgba(30,20,60,0.08)] dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">Your team</h2>
              <p className="mt-0.5 text-xs text-stone-500">Agents on shift and their status.</p>
            </div>
            <Link href="/agents" className="text-xs font-semibold text-violet-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {agents.length === 0 ? (
              <p className="rounded-xl bg-stone-50 p-4 text-center text-xs text-stone-500 dark:bg-stone-900">
                No agents yet — build your first team member to start calling.
              </p>
            ) : (
              agents.slice(0, 5).map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-content-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                      <Bot className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-medium text-stone-900 dark:text-white">
                      {agent.name}
                    </span>
                  </span>
                  <Badge variant={agent.status === "active" ? "success" : "secondary"}>
                    {agent.status === "active" ? "Working" : agent.status}
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[20px] border border-stone-200/70 bg-white p-6 shadow-[0_8px_30px_rgba(30,20,60,0.08)] dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">Needs your attention</h2>
              <p className="mt-0.5 text-xs text-stone-500">Callbacks requested and failed dials.</p>
            </div>
            <Link href="/calls" className="text-xs font-semibold text-violet-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {attentionCalls.length === 0 ? (
              <p className="rounded-xl bg-stone-50 p-4 text-center text-xs text-stone-500 dark:bg-stone-900">
                All clear — nothing needs a follow-up right now.
              </p>
            ) : (
              attentionCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-stone-700 dark:text-stone-300">
                    {call.to_number || call.from_number || "Unknown number"}
                  </span>
                  <Badge variant={call.status === "failed" ? "destructive" : "warning"}>
                    {call.status === "failed" ? "Failed" : "Callback"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Recent calls */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-white">
              Recent conversations
            </h2>
            <p className="text-xs text-stone-500">
              Transcripts, audio playback, and outcome tagging.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsTestCallOpen(true)}>
            <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
            Test call
          </Button>
        </div>

        <CallsTable
          initialCalls={recentCalls}
          operationDirection={operationDirection}
          operationPeriod={operationPeriod}
        />
      </div>

      <TestCallDialog
        isOpen={isTestCallOpen}
        onClose={() => setIsTestCallOpen(false)}
      />
    </div>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<div className="text-sm text-stone-500">Loading dashboard…</div>}><DashboardContent /></Suspense>;
}
