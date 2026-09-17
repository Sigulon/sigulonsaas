"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { CallsChart } from "@/components/dashboard/calls-chart";
import { CallsTable } from "@/components/calls/calls-table";
import { CallRecord } from "@/lib/types";

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
      const [statsRes, callsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/calls?limit=10"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.stats) setStats(statsData.stats);
      }

      if (callsRes.ok) {
        const callsData = await callsRes.json();
        setRecentCalls(callsData.calls || []);
      }

    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-8">
      {/* KPI Cards Strip */}
      <KpiCards stats={stats} />

      {/* Calls Over Time Chart */}
      <CallsChart data={stats.chart_data} />

      {/* Recent Dispatched Calls Log */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Recent Call Logs
            </h2>
            <p className="text-xs text-slate-500">
              Inspect real-time conversation transcripts, audio playback, and sentiment tagging.
            </p>
          </div>
        </div>

        <CallsTable
          initialCalls={recentCalls}
          operationDirection={operationDirection}
          operationPeriod={operationPeriod}
        />
      </div>

    </div>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<div className="text-sm text-slate-500">Loading dashboard…</div>}><DashboardContent /></Suspense>;
}
