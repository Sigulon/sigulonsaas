"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Search,
  Filter,
  Download,
  Phone,
  Flame,
  CheckCircle2,
  Clock,
  ChevronRight,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Calendar,
  Tag,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lead, LeadStatus, LeadChannel, Agent } from "@/lib/types/sigulon";
import { getLeads, updateLead } from "@/lib/api/leads";
import { getAgents } from "@/lib/api/agents";

export default function LeadsResultsPage() {
  const searchParams = useSearchParams();
  const initialLeadId = searchParams.get("leadId");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<LeadChannel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all" | "hot_only">("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");

  // Selected Lead Drawer
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const ags = await getAgents();
        setAgentsList(ags);
      } catch (err) {
        console.error("[results] Error loading agents:", err);
      }
    }
    loadAgents();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getLeads({
        channel: channelFilter,
        status: statusFilter,
        agentId: selectedAgentId,
        search,
      });
      setLeads(data);

      if (initialLeadId) {
        const found = data.find((l) => l.id === initialLeadId);
        if (found) setActiveLead(found);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [channelFilter, statusFilter, selectedAgentId, search]);

  const handleMarkHot = async (leadId: string) => {
    const updated = await updateLead(leadId, { status: "hot", qualificationScore: 99 });
    if (updated) {
      setActiveLead(updated);
      loadData();
    }
  };

  const totalLeads = leads.length;
  const qualifiedCount = leads.filter((l) => l.status === "qualified" || l.status === "hot").length;
  const conversionRate = totalLeads > 0 ? ((qualifiedCount / totalLeads) * 100).toFixed(1) : "0.0";
  const pendingCallbackCount = leads.filter((l) => l.status === "callback").length;
  const hotLeadsCount = leads.filter((l) => l.status === "hot" || l.qualificationScore >= 90).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Leads & Results
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
            Every lead contacted by your AI agents — across instant, bulk campaigns, and inbound calls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>TOTAL LEADS</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">
            {isLoading ? "—" : totalLeads.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">across all channels</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>QUALIFIED</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {isLoading ? "—" : qualifiedCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">{conversionRate}% conversion rate</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>PENDING CALLBACK</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {isLoading ? "—" : pendingCallbackCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">follow-up required</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>HOT LEADS</span>
            <Flame className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
            {isLoading ? "—" : hotLeadsCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">high purchase intent</div>
        </Card>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, city or captured info..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Channel Tabs */}
          <div className="flex items-center bg-gray-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
            {(["all", "instant", "bulk", "inbound"] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  channelFilter === ch
                    ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-2xs font-semibold"
                    : "text-gray-600 dark:text-neutral-400 hover:text-gray-900"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Outcomes</option>
            <option value="hot_only">🔥 Hot Only</option>
            <option value="qualified">Qualified</option>
            <option value="interested">Interested</option>
            <option value="callback">Callback</option>
            <option value="not_interested">Not Interested</option>
          </select>

          {/* Agent Dropdown */}
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Agents</option>
            {agentsList.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <Card className="border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                <th className="py-3 px-5">Lead / Contact</th>
                <th className="py-3 px-3">Channel</th>
                <th className="py-3 px-3">Agent</th>
                <th className="py-3 px-3">Outcome</th>
                <th className="py-3 px-3 font-mono">Score</th>
                <th className="py-3 px-3 font-mono">Duration</th>
                <th className="py-3 px-3">Last Contacted</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-gray-500">
                    Loading leads and results...
                  </td>
                </tr>
              )}
              {!isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-gray-500">
                    No leads or call interactions recorded yet for this filter.
                  </td>
                </tr>
              )}
              {!isLoading &&
                leads.map((lead) => {
                  const isSelected = activeLead?.id === lead.id;

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setActiveLead(lead)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-50/60 dark:bg-blue-950/30"
                          : "hover:bg-gray-50/70 dark:hover:bg-neutral-800/40"
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {lead.name}
                        </div>
                        <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                          {lead.phone} · {lead.city}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {lead.channel}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-3 font-medium text-gray-800 dark:text-neutral-200">
                        {lead.agentName}
                      </td>
                      <td className="py-3.5 px-3">
                        <Badge
                          variant={
                            lead.status === "qualified" || lead.status === "hot"
                              ? "success"
                              : lead.status === "callback"
                              ? "warning"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {lead.status === "hot" ? "🔥 Hot" : lead.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-gray-900 dark:text-white">
                        {lead.qualificationScore}/100
                      </td>
                      <td className="py-3.5 px-3 font-mono text-gray-600 dark:text-neutral-300">
                        {Math.floor(lead.durationSeconds / 60)}m {lead.durationSeconds % 60}s
                      </td>
                      <td className="py-3.5 px-3 text-gray-400">
                        {lead.lastContactedAt.replace("T", " ").substring(0, 16)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button className="text-gray-400 hover:text-blue-600 p-1">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Lead Detail Drawer / Modal */}
      {activeLead && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-neutral-900 border-l border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
          <div>
            {/* Drawer Header */}
            <div className="p-5 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-850">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  {activeLead.name}
                </h3>
                <p className="text-xs font-mono text-gray-500 mt-0.5">
                  {activeLead.phone} · {activeLead.city}
                </p>
              </div>
              <button
                onClick={() => setActiveLead(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)] text-xs">
              {/* Score & Status Bar */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-gray-400 text-[11px] block">Qualification Score</span>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {activeLead.qualificationScore}/100
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 text-[11px] block">Assigned Agent</span>
                  <div className="font-semibold text-gray-900 dark:text-white mt-0.5">
                    {activeLead.agentName}
                  </div>
                </div>
              </div>

              {/* Extracted Variables */}
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-[11px] mb-2.5">
                  Captured Lead Data
                </h4>
                <div className="space-y-1.5 bg-gray-50/70 dark:bg-neutral-850 p-3 rounded-lg border border-gray-100 dark:border-neutral-800 font-mono text-[11px]">
                  {Object.entries(activeLead.extractedVariables).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1 border-b border-gray-200/50 dark:border-neutral-800 last:border-none">
                      <span className="text-gray-400">{k}:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              {activeLead.transcriptSummary && (
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-[11px] mb-1.5">
                    AI Conversation Summary
                  </h4>
                  <p className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg text-gray-800 dark:text-neutral-200 leading-relaxed">
                    {activeLead.transcriptSummary}
                  </p>
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-[11px] mb-2">
                  Activity Timeline
                </h4>
                <div className="space-y-3 pl-2 border-l-2 border-gray-200 dark:border-neutral-800">
                  {activeLead.timeline.map((ev, idx) => (
                    <div key={idx} className="relative pl-3">
                      <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white dark:ring-neutral-900" />
                      <div className="font-semibold text-gray-900 dark:text-white">{ev.title}</div>
                      <p className="text-gray-500 text-[11px] mt-0.5">{ev.detail}</p>
                      <span className="text-[10px] text-gray-400 mt-0.5 block">{ev.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Actions Footer */}
          <div className="p-4 border-t border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-900 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMarkHot(activeLead.id)}
              className="gap-1.5 text-xs text-red-600 hover:text-red-700"
            >
              <Flame className="w-3.5 h-3.5 fill-red-500/20" />
              <span>Mark Hot</span>
            </Button>

            <Link href={`/calling/instant?phone=${activeLead.phone}`}>
              <Button variant="primary" size="sm" className="gap-1.5 text-xs">
                <Phone className="w-3.5 h-3.5" />
                <span>Call Again</span>
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
