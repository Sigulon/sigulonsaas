"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Radio,
  Play,
  Pause,
  PhoneCall,
  Save,
  Check,
  Sparkles,
  Phone,
  FileText,
  Sliders,
  Share2,
  ListOrdered,
  BookOpen,
  Volume2,
  Settings,
  History,
  CheckCircle2,
  Clock,
  Coins,
  Send,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Agent, Call } from "@/lib/types/sigulon";
import { getAgentById, toggleAgentStatus, updateAgent } from "@/lib/api/agents";
import { getCalls } from "@/lib/api/calls";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentCalls, setAgentCalls] = useState<Call[]>([]);
  const [activeTab, setActiveTab] = useState<
    "overview" | "script" | "training" | "actions" | "outcomes" | "voice" | "settings" | "history"
  >("overview");
  const [isSaved, setIsSaved] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Form editable states
  const [openingMessage, setOpeningMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [stability, setStability] = useState(0.8);

  useEffect(() => {
    async function load() {
      const [data, calls] = await Promise.all([
        getAgentById(id),
        getCalls({ agentId: id }),
      ]);
      if (data) {
        setAgent(data);
        setOpeningMessage(data.openingMessage);
        setInstructions(data.instructions);
        setSpeed(data.speed);
        setStability(data.stability);
      }
      setAgentCalls(calls);
    }
    load();
  }, [id]);

  if (!agent) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Loading agent details...
      </div>
    );
  }

  const handleToggleStatus = async () => {
    const updated = await toggleAgentStatus(agent.id);
    if (updated) setAgent(updated);
  };

  const handleSave = async () => {
    const updated = await updateAgent(agent.id, {
      openingMessage,
      instructions,
      speed,
      stability,
    });
    if (updated) {
      setAgent(updated);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Link
            href="/agents"
            className="p-1.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 font-bold text-lg flex items-center justify-center shrink-0">
              {agent.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {agent.name}
                </h1>
                <Badge
                  variant={agent.status === "ready" ? "success" : "secondary"}
                  className="capitalize text-xs"
                >
                  {agent.status}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                {agent.role} · {agent.language} · Assigned: {agent.phoneNumber}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Link href={`/talk?agent=${agent.id}`}>
            <Button variant="subtle" size="sm" className="gap-2">
              <Radio className="w-4 h-4 text-blue-600" />
              <span>Talk to agent</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            className="gap-1.5"
          >
            {agent.status === "ready" ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-600" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-600" />
                <span>Resume</span>
              </>
            )}
          </Button>

          <Button variant="primary" size="sm" onClick={handleSave} className="gap-1.5">
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSaved ? "Saved" : "Save Changes"}</span>
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: "overview", label: "Overview", icon: Bot },
            { id: "script", label: "Call script", icon: FileText },
            { id: "training", label: "Training", icon: BookOpen },
            { id: "actions", label: "Actions", icon: Share2 },
            { id: "outcomes", label: "Outcomes", icon: CheckCircle2 },
            { id: "voice", label: "Voice", icon: Volume2 },
            { id: "settings", label: "Settings", icon: Settings },
            { id: "history", label: "Call history", icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <Card className="p-4">
              <div className="text-xs text-gray-400">Total Calls</div>
              <div className="text-xl font-bold font-mono text-gray-900 dark:text-white mt-1">
                {agent.totalCalls}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{agent.callsToday} today</div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-400">Connected</div>
              <div className="text-xl font-bold font-mono text-gray-900 dark:text-white mt-1">
                {agent.totalCalls}
              </div>
              <div className="text-[11px] text-emerald-600 mt-0.5">
                {agent.totalCalls > 0 ? "100% answer rate" : "0% answer rate"}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-400">Qualified Leads</div>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {agent.qualifiedCount}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{agent.conversionRate}% conv</div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-400">Avg Call Duration</div>
              <div className="text-xl font-bold font-mono text-gray-900 dark:text-white mt-1">
                {Math.floor(agent.avgDurationSeconds / 60)}m {agent.avgDurationSeconds % 60}s
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">per completed turn</div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-400">Credits Used</div>
              <div className="text-xl font-bold font-mono text-gray-900 dark:text-white mt-1">
                ₹{agent.creditsUsed.toFixed(1)}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">lifetime spend</div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-gray-400">Latency</div>
              <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                390ms
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">end-to-end voice</div>
            </Card>
          </div>

          {/* Recent Agent Calls Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Calls by {agent.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                      <th className="py-2.5 px-4 font-mono">Date</th>
                      <th className="py-2.5 px-4 font-mono">Callee</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 font-mono">Duration</th>
                      <th className="py-2.5 px-3">Outcome</th>
                      <th className="py-2.5 px-4 text-right">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                    {agentCalls.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/60 dark:hover:bg-neutral-800/40">
                        <td className="py-3 px-4 font-mono text-gray-600 dark:text-neutral-400">
                          {c.createdAt.replace("T", " ").substring(0, 16)}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                          {c.calleeNumber}
                        </td>
                        <td className="py-3 px-3 capitalize text-gray-500">{c.type}</td>
                        <td className="py-3 px-3 font-mono">
                          {Math.floor(c.durationSeconds / 60)}m {c.durationSeconds % 60}s
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="success" className="capitalize">
                            {c.outcome}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 max-w-xs truncate">
                          {c.aiSummary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: CALL SCRIPT */}
      {activeTab === "script" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Opening Line</CardTitle>
                <p className="text-xs text-gray-500">
                  Spoken word-for-word the instant the callee answers.
                </p>
              </CardHeader>
              <CardContent>
                <textarea
                  rows={3}
                  value={openingMessage}
                  onChange={(e) => setOpeningMessage(e.target.value)}
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Conversation Instructions</CardTitle>
                <p className="text-xs text-gray-500">
                  Rules, objection handling, and qualification flow.
                </p>
              </CardHeader>
              <CardContent>
                <textarea
                  rows={8}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono leading-relaxed text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Panel: Pre-call Variables */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Pre-Call Variables</CardTitle>
                <p className="text-xs text-gray-500">
                  Injected dynamically from your campaign CSV or instant lead form.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {agent.preCallVariables.map((v) => (
                  <div
                    key={v}
                    className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-neutral-800 text-xs"
                  >
                    <code className="text-blue-600 dark:text-blue-400 font-mono">
                      &#123;&#123;{v}&#125;&#125;
                    </code>
                    <span className="text-gray-400 text-[10px]">dynamic</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: TRAINING */}
      {activeTab === "training" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Knowledge Base & FAQ Training</CardTitle>
            <p className="text-xs text-gray-500">
              Upload PDF brochures, rate cards, or policy clauses for real-time RAG groundings.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-8 border-2 border-dashed border-gray-200 dark:border-neutral-800 rounded-xl text-center">
              <BookOpen className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Upload knowledge documents
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                PDF, CSV, or TXT files up to 25MB each. Synthesized into live vector indexes.
              </p>
              <Button variant="outline" size="sm" className="mt-4">
                Choose Document
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 4: ACTIONS */}
      {activeTab === "actions" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Integrated Triggers</CardTitle>
            <p className="text-xs text-gray-500">
              Configured automated webhook calls and telephony handoffs.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3.5 rounded-lg border border-gray-200 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900 dark:text-white">
                  Warm Transfer Number:
                </span>
                <span className="font-mono text-blue-600 ml-2">
                  {agent.actions.transferNumber || "None"}
                </span>
              </div>
              <Badge variant="success">Active</Badge>
            </div>

            <div className="p-3.5 rounded-lg border border-gray-200 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900 dark:text-white">
                  CRM Webhook Endpoint:
                </span>
                <span className="font-mono text-gray-600 dark:text-neutral-400 ml-2">
                  {agent.actions.webhookUrl || "None"}
                </span>
              </div>
              <Badge variant="blue">Webhook</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 5: OUTCOMES */}
      {activeTab === "outcomes" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Lead Qualification Rubric</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300 block mb-1">
                Criteria for "Qualified" Status:
              </span>
              <p className="text-gray-700 dark:text-neutral-300">{agent.qualificationCriteria}</p>
            </div>

            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <span className="font-semibold text-red-800 dark:text-red-300 block mb-1">
                Negative Guardrails:
              </span>
              <p className="text-gray-700 dark:text-neutral-300">{agent.forbiddenRules}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 6: VOICE */}
      {activeTab === "voice" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Voice Model & Speed Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{agent.voiceName}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  Provider: {agent.voiceProvider} · Model ID: {agent.voiceId}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                className="gap-2"
              >
                {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlayingAudio ? "Stop" : "Test Play Voice"}</span>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Speed ({speed}x)</label>
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Stability ({Math.round(stability * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={stability}
                  onChange={(e) => setStability(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 7: SETTINGS */}
      {activeTab === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Agent Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <label className="block font-medium mb-1">Telephony Caller ID</label>
              <input
                type="text"
                readOnly
                value={agent.phoneNumber}
                className="w-full max-w-sm px-3 py-2 border rounded-lg bg-gray-50 dark:bg-neutral-800 font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 8: CALL HISTORY */}
      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Historical Conversation Logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agentCalls.map((call) => (
              <div
                key={call.id}
                className="p-3.5 rounded-lg border border-gray-200 dark:border-neutral-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {call.calleeNumber}
                  </span>
                  <span className="text-gray-400">{call.createdAt.substring(0, 16)}</span>
                </div>
                <p className="text-gray-600 dark:text-neutral-300">{call.aiSummary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
