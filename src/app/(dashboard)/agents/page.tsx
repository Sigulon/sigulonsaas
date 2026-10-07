"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Filter, Bot, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/agents/agent-card";
import { Agent, AgentStatus, AgentChannel } from "@/lib/types/sigulon";
import { getAgents, duplicateAgent, toggleAgentStatus } from "@/lib/api/agents";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all");
  const [channelFilter, setChannelFilter] = useState<AgentChannel | "all">("all");

  const loadAgents = async () => {
    setIsLoading(true);
    try {
      const data = await getAgents({
        status: statusFilter,
        channel: channelFilter,
        search,
      });
      setAgents(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, [statusFilter, channelFilter, search]);

  const handleDuplicate = async (id: string) => {
    await duplicateAgent(id);
    loadAgents();
  };

  const handleToggleStatus = async (id: string) => {
    await toggleAgentStatus(id);
    loadAgents();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Agents
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
            Create and manage your AI voice calling agents.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/agents/new">
            <Button variant="primary" size="sm" className="gap-2 shadow-xs">
              <Plus className="w-4 h-4" />
              <span>Create agent</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-3 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents by name, role or language..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center bg-gray-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
            {(["all", "ready", "paused", "draft"] as const).map((s) => (
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

          {/* Channel Select */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as AgentChannel | "all")}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All channels</option>
            <option value="campaigns">Campaigns</option>
            <option value="instant">Instant Lead</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>
      </div>

      {/* Agents Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 bg-gray-100 dark:bg-neutral-800/50 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-dashed border-gray-300 dark:border-neutral-800 p-8">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
            <Bot className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            No agents found
          </h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400 max-w-sm mx-auto mt-1 mb-5">
            Create your first AI voice agent and start calling leads automatically.
          </p>
          <Link href="/agents/new">
            <Button variant="primary" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              <span>Create agent</span>
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onDuplicate={handleDuplicate}
              onToggleStatus={handleToggleStatus}
            />
          ))}

          {/* Quick Create Card Slot */}
          <Link
            href="/agents/new"
            className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed border-gray-200 dark:border-neutral-800 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 transition-all text-center group cursor-pointer min-h-[260px]"
          >
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
              Create a new agent
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">
              Configure speech, voice prompt, and call actions
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
