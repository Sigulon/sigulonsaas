"use client";

import { Suspense } from "react";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardKpiCards } from "@/components/dashboard/dashboard-kpi-cards";
import { CallActivityChart } from "@/components/dashboard/call-activity-chart";
import { AgentPerformanceTable } from "@/components/dashboard/agent-performance-table";
import { RecentActivityFeed } from "@/components/dashboard/recent-activity-feed";

function DashboardContent() {
  return (
    <div className="space-y-6">
      {/* 1. Header & Hero */}
      <DashboardHero />

      {/* 2. KPI Cards Row (6 metrics) */}
      <DashboardKpiCards />

      {/* 3. Call Activity Chart */}
      <CallActivityChart />

      {/* 4. Two-Column Section: Agent Performance & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AgentPerformanceTable />
        </div>
        <div className="lg:col-span-1">
          <RecentActivityFeed />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-gray-500">
          Loading dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
