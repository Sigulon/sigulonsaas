"use client";

import { useEffect, useState, useCallback } from "react";
import { VoiceAgent } from "@/lib/types";
import { AgentCard } from "@/components/agents/agent-card";
import { WebVoiceTesterModal } from "@/components/agents/web-voice-tester-modal";
import { Button } from "@/components/ui/button";
import { Plus, Bot, Sparkles, Loader2, Headphones, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function AgentsPage() {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isWebTesterOpen, setIsWebTesterOpen] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch("/api/agents");
      if (!res.ok) {
        setLoadError(res.status === 401 ? "Session expired — please log in again." : "Failed to load agents. Please retry.");
        setAgents([]);
        return;
      }
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e) {
      console.error("Failed to load agents from Cartesia", e);
      setLoadError("Failed to load agents. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    fetchAgents();
  }, [fetchAgents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="h-6 w-6 text-indigo-600" />
            AI Voice Agents
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Live voice agents with Indian language models (Hindi, Telugu, Tamil, Kannada, Indian English, etc.).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchAgents}
            disabled={loading}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsWebTesterOpen(true)}
            className="text-xs flex items-center gap-1.5 border-indigo-200 text-indigo-700 dark:border-indigo-900 dark:text-indigo-300 hover:bg-indigo-50"
          >
            <Headphones className="h-3.5 w-3.5" />
            Web Voice Tester
          </Button>

          <Link href="/agents/builder">
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs shadow-sm font-semibold h-9 px-4"
            >
              <Plus className="h-4 w-4" />
              Build Voice Agent
            </Button>
          </Link>
        </div>
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
          <span className="text-sm">Fetching your voice agents...</span>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 p-12 text-center">
          <h3 className="mt-3 text-base font-semibold text-red-700 dark:text-red-300">
            Couldn&apos;t load agents
          </h3>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400 max-w-sm mx-auto">
            {loadError}
          </p>
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
          <Bot className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
            No Voice Agents Found
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Create an Indian language AI voice agent with custom prompts, live tools, and Plivo voice execution.
          </p>
          <Link href="/agents/builder">
            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Sparkles className="h-4 w-4 mr-2" />
              Build Voice Agent
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onRefresh={fetchAgents} />
          ))}
        </div>
      )}

      {/* Web Voice Tester Modal */}
      <WebVoiceTesterModal
        isOpen={isWebTesterOpen}
        onClose={() => setIsWebTesterOpen(false)}
        agent={agents[0] || null}
      />
    </div>
  );
}
