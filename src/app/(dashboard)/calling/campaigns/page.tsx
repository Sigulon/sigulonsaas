"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  ArrowRight,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Campaign, CampaignStatus } from "@/lib/types/sigulon";
import { getCampaigns, toggleCampaignStatus } from "@/lib/api/campaigns";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getCampaigns({ status: statusFilter, search });
      setCampaigns(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, search]);

  const handleToggle = async (id: string) => {
    await toggleCampaignStatus(id);
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Bulk campaigns
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
            Automate high-volume outbound dialing with concurrency governors and smart retry logic.
          </p>
        </div>
        <Link href="/calling/campaigns/new">
          <Button variant="primary" size="sm" className="gap-2 shadow-xs">
            <Plus className="w-4 h-4" />
            <span>Create campaign</span>
          </Button>
        </Link>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-3 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center bg-gray-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
          {(["all", "running", "paused", "completed", "scheduled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                statusFilter === s
                  ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-2xs font-semibold"
                  : "text-gray-600 dark:text-neutral-400 hover:text-gray-900"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns Table */}
      <Card className="border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 bg-gray-50/50 dark:bg-neutral-850">
                <th className="py-3 px-5">Campaign</th>
                <th className="py-3 px-3">Agent</th>
                <th className="py-3 px-3 font-mono">Leads</th>
                <th className="py-3 px-3 font-mono">Calls</th>
                <th className="py-3 px-3 font-mono">Connected</th>
                <th className="py-3 px-3 font-mono">Qualified</th>
                <th className="py-3 px-3">Progress</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {campaigns.map((camp) => (
                <tr key={camp.id} className="hover:bg-gray-50/70 dark:hover:bg-neutral-800/40">
                  <td className="py-3.5 px-5">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {camp.name}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                      Caller ID: {camp.callerId}
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="font-medium text-gray-800 dark:text-neutral-200">
                      {camp.agentName}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 font-mono font-medium">{camp.leadsCount}</td>
                  <td className="py-3.5 px-3 font-mono">{camp.callsAttempted}</td>
                  <td className="py-3.5 px-3 font-mono">{camp.callsConnected}</td>
                  <td className="py-3.5 px-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {camp.qualifiedLeads}
                  </td>
                  <td className="py-3.5 px-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all"
                          style={{ width: `${camp.progress}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-gray-500">{camp.progress}%</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <Badge
                      variant={
                        camp.status === "running"
                          ? "success"
                          : camp.status === "completed"
                          ? "blue"
                          : "secondary"
                      }
                      className="capitalize"
                    >
                      {camp.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {camp.status === "running" || camp.status === "paused" ? (
                        <button
                          onClick={() => handleToggle(camp.id)}
                          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 hover:text-gray-900"
                          title={camp.status === "running" ? "Pause campaign" : "Resume campaign"}
                        >
                          {camp.status === "running" ? (
                            <Pause className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                        </button>
                      ) : null}
                      <Link
                        href={`/results?campaignId=${camp.id}`}
                        className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 hover:text-blue-600"
                        title="View campaign leads"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
