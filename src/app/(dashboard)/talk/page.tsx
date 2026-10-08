"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  Bot,
  Activity,
  Headphones,
  ArrowRight,
  Phone,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAgents } from "@/lib/api/agents";
import { Agent } from "@/lib/types/sigulon";
import { BrowserCallPlayground } from "@/components/builder/browser-call-playground";

function TalkPageContent() {
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");

  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAgents() {
      try {
        setLoading(true);
        const data = await getAgents();
        setAgentsList(data);
        if (data.length > 0) {
          const match = agentParam ? data.find((a) => a.id === agentParam) : data[0];
          setSelectedAgent(match || data[0]);
        }
      } catch (err) {
        console.error("[talk] Error loading agents:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAgents();
  }, [agentParam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-neutral-400">
          <Activity className="w-7 h-7 animate-spin text-blue-600" />
          <p className="text-sm font-medium">Loading voice agents...</p>
        </div>
      </div>
    );
  }

  if (agentsList.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
          <Bot className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          No voice agents created yet
        </h2>
        <p className="text-xs text-gray-500 dark:text-neutral-400">
          Create your first natural language AI voice agent before testing live conversations.
        </p>
        <Link href="/agents/new">
          <Button variant="primary" size="sm" className="gap-2 shadow-xs">
            <Plus className="w-4 h-4" />
            <span>Create Agent</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">
            <Headphones className="w-6 h-6 text-blue-600" />
            Web Voice Studio
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
            Test live conversations with your AI voice agents in your browser using microphone and neural voice playback.
          </p>
        </div>

        {selectedAgent && (
          <Link href={`/agents/${selectedAgent.id}`}>
            <Button variant="outline" size="sm" className="gap-1.5 shadow-2xs">
              <span>Agent Settings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Real Agents List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-gray-200 dark:border-neutral-800 shadow-2xs">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase text-gray-400 dark:text-neutral-500 tracking-wider flex items-center justify-between">
                <span>Select Agent</span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {agentsList.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-2 pt-0">
              {agentsList.map((ag) => {
                const isSelected = selectedAgent?.id === ag.id;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => setSelectedAgent(ag)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-gray-900 dark:text-white shadow-xs ring-1 ring-blue-500/20"
                        : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-gray-300 dark:hover:border-neutral-700 text-gray-900 dark:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm truncate">
                        {ag.name}
                      </span>
                      <Badge
                        variant={ag.status === "ready" ? "success" : "secondary"}
                        className="capitalize text-[10px]"
                      >
                        {ag.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-neutral-400 mt-1 line-clamp-1">
                      {ag.role}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400 dark:text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-gray-400" />
                        <span>{ag.language}</span>
                      </span>
                      {ag.phoneNumber && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono text-[10px]">
                            <Phone className="w-2.5 h-2.5 text-gray-400" />
                            <span>{ag.phoneNumber}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Center: Live Interactive Voice Playground */}
        <div className="lg:col-span-3 space-y-4">
          {selectedAgent ? (
            <BrowserCallPlayground
              key={selectedAgent.id}
              agentId={selectedAgent.id}
              agentName={selectedAgent.name}
              language={selectedAgent.languageCode || selectedAgent.language}
              voiceName={selectedAgent.voiceName || "Sonic Voice"}
              voiceId={selectedAgent.voiceId}
              systemPrompt={selectedAgent.instructions}
            />
          ) : (
            <div className="p-12 text-center text-sm text-gray-500 dark:text-neutral-400">
              Please select an agent from the list on the left to start testing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TalkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Activity className="w-7 h-7 animate-spin text-blue-600" />
        </div>
      }
    >
      <TalkPageContent />
    </Suspense>
  );
}
