"use client";

import { useState, useEffect } from "react";
import {
  PhoneCall,
  Search,
  Filter,
  Play,
  Pause,
  Download,
  X,
  Clock,
  Coins,
  Bot,
  Activity,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Call, CallOutcome, CallDirection, Agent } from "@/lib/types/sigulon";
import { getCalls } from "@/lib/api/calls";
import { getAgents } from "@/lib/api/agents";

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<CallOutcome | "all">("all");
  const [directionFilter, setDirectionFilter] = useState<CallDirection | "all">("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");

  // Selected Call Sheet
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  useEffect(() => {
    async function loadAgents() {
      try {
        const ags = await getAgents();
        setAgentsList(ags);
      } catch (err) {
        console.error("[calls] Error loading agents:", err);
      }
    }
    loadAgents();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getCalls({
        outcome: outcomeFilter,
        direction: directionFilter,
        agentId: selectedAgentId,
        search,
      });
      setCalls(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [outcomeFilter, directionFilter, selectedAgentId, search]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Call History
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
          Audited logs of all inbound and outbound voice sessions with transcripts and telemetry.
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search callee number, summary, or transcript..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direction Tabs */}
          <div className="flex items-center bg-gray-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
            {(["all", "outbound", "inbound"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirectionFilter(d)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  directionFilter === d
                    ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-2xs font-semibold"
                    : "text-gray-600 dark:text-neutral-400 hover:text-gray-900"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200"
          >
            <option value="all">All Outcomes</option>
            <option value="qualified">Qualified</option>
            <option value="interested">Interested</option>
            <option value="callback">Callback</option>
            <option value="not_interested">Not Interested</option>
          </select>

          {/* Agent Filter */}
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200"
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

      {/* Calls Table */}
      <Card className="border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                <th className="py-3 px-5 font-mono">Date</th>
                <th className="py-3 px-4 font-mono">Callee</th>
                <th className="py-3 px-4 font-mono">Caller ID</th>
                <th className="py-3 px-3">Agent</th>
                <th className="py-3 px-3">Direction</th>
                <th className="py-3 px-3 font-mono">Duration</th>
                <th className="py-3 px-3">Outcome</th>
                <th className="py-3 px-3 font-mono">Cost</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {calls.map((c) => {
                const isSelected = selectedCall?.id === c.id;

                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCall(c)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50/60 dark:bg-blue-950/30"
                        : "hover:bg-gray-50/70 dark:hover:bg-neutral-800/40"
                    }`}
                  >
                    <td className="py-3.5 px-5 font-mono text-gray-500">
                      {c.createdAt.replace("T", " ").substring(0, 16)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-gray-900 dark:text-white">
                      {c.calleeNumber}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-400">{c.callerNumber}</td>
                    <td className="py-3.5 px-3 font-semibold text-blue-600 dark:text-blue-400">
                      {c.agentName}
                    </td>
                    <td className="py-3.5 px-3 capitalize text-gray-600 dark:text-neutral-300">
                      {c.direction}
                    </td>
                    <td className="py-3.5 px-3 font-mono">
                      {Math.floor(c.durationSeconds / 60)}m {c.durationSeconds % 60}s
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge
                        variant={c.outcome === "qualified" ? "success" : "secondary"}
                        className="capitalize"
                      >
                        {c.outcome}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-gray-900 dark:text-white">
                      ₹{c.costCredits.toFixed(2)}
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

      {/* Call Detail Sheet */}
      {selectedCall && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-neutral-900 border-l border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
          <div>
            <div className="p-5 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-850">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  Call Details & Transcript
                </h3>
                <p className="text-xs font-mono text-gray-500 mt-0.5">
                  {selectedCall.calleeNumber} · {selectedCall.agentName} ({selectedCall.direction})
                </p>
              </div>
              <button
                onClick={() => setSelectedCall(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)] text-xs">
              {/* Audio Player Bar */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                    className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-xs"
                  >
                    {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      Recording Playback
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono">
                      {Math.floor(selectedCall.durationSeconds / 60)}m {selectedCall.durationSeconds % 60}s · Two-way audio
                    </div>
                  </div>
                </div>
                <Badge variant="success" className="capitalize">
                  {selectedCall.outcome}
                </Badge>
              </div>

              {/* AI Summary */}
              <div>
                <h4 className="font-semibold uppercase tracking-wider text-[11px] text-gray-400 mb-1.5">
                  AI Call Summary
                </h4>
                <p className="p-3 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg text-gray-800 dark:text-neutral-200 leading-relaxed">
                  {selectedCall.aiSummary}
                </p>
              </div>

              {/* Key Takeaways */}
              <div>
                <h4 className="font-semibold uppercase tracking-wider text-[11px] text-gray-400 mb-2">
                  Key Takeaways
                </h4>
                <ul className="space-y-1.5 list-disc list-inside text-gray-700 dark:text-neutral-300">
                  {selectedCall.keyTakeaways.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>

              {/* Telemetry Latency Breakdown */}
              <div className="p-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50/60 dark:bg-neutral-850 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  <span>Voice Latency Breakdown</span>
                </h4>
                <div className="grid grid-cols-4 gap-2 text-center pt-1 font-mono text-[11px]">
                  <div className="bg-white dark:bg-neutral-800 p-2 rounded">
                    <span className="text-gray-400 text-[10px] block">LiveKit</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {selectedCall.latencyMs.livekit}ms
                    </span>
                  </div>
                  <div className="bg-white dark:bg-neutral-800 p-2 rounded">
                    <span className="text-gray-400 text-[10px] block">Nova-3 STT</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {selectedCall.latencyMs.stt}ms
                    </span>
                  </div>
                  <div className="bg-white dark:bg-neutral-800 p-2 rounded">
                    <span className="text-gray-400 text-[10px] block">Gemini LLM</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {selectedCall.latencyMs.llm}ms
                    </span>
                  </div>
                  <div className="bg-white dark:bg-neutral-800 p-2 rounded">
                    <span className="text-gray-400 text-[10px] block">Sonic TTS</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {selectedCall.latencyMs.tts}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Transcript */}
              <div>
                <h4 className="font-semibold uppercase tracking-wider text-[11px] text-gray-400 mb-2">
                  Full Conversation Transcript
                </h4>
                <div className="space-y-2.5 bg-gray-50/40 dark:bg-neutral-950 p-3.5 rounded-xl border border-gray-100 dark:border-neutral-800">
                  {selectedCall.transcript.map((line, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex items-center gap-2 font-mono text-[10px] text-gray-400">
                        <span className="font-bold text-blue-600 uppercase">
                          {line.speaker === "agent" ? selectedCall.agentName : "Callee"}
                        </span>
                        <span>{line.time}</span>
                      </div>
                      <p className="text-gray-800 dark:text-neutral-200 leading-relaxed">
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
