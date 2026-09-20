"use client";

import { use, useEffect, useState, useCallback } from "react";
import { VoiceAgent, CallRecord } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { CARTESIA_VOICE_PRESETS, INDIAN_LANGUAGES } from "@/lib/cartesia";
import { CallsTable } from "@/components/calls/calls-table";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import { WebVoiceTesterModal } from "@/components/agents/web-voice-tester-modal";
import {
  Bot,
  Phone,
  PhoneCall,
  Save,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Headphones,
} from "lucide-react";
import Link from "next/link";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState(CARTESIA_VOICE_PRESETS[0].id);
  const [language, setLanguage] = useState("en");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const [isWebTesterOpen, setIsWebTesterOpen] = useState(false);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.agent) {
          const ag = data.agent;
          setAgent(ag);
          setName(ag.name);
          setVoiceId(ag.voice_id);
          setLanguage(ag.language || "en");
          setSystemPrompt(ag.system_prompt);
          setIntroduction(ag.introduction || "");
          setStatus(ag.status);
        }
      }
      // Also fetch calls for this agent
      const callsRes = await fetch(`/api/calls?agent_id=${id}&limit=10`);
      if (callsRes.ok) {
        const callsData = await callsRes.json();
        if (callsData.calls) setCalls(callsData.calls);
      }
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    fetchAgent();
  }, [fetchAgent]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setSaveError(null);

    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          voiceId,
          language,
          systemPrompt,
          introduction,
          status,
        }),
      });
      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError((data as { error?: string }).error || `Save failed (${res.status}). Please retry.`);
      }
    } catch (e) {
      console.error(e);
      setSaveError("Save failed. Please check your connection and retry.");
    } finally {
      setSaving(false);
    }
  };

  if (!agent) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-stone-400">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600 mb-2" />
        <span>Loading voice agent details...</span>
      </div>
    );
  }

  const assignedNumber = agent.phone_numbers?.[0];

  return (
    <div className="space-y-6">
      {/* Top Back Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/agents"
          className="flex items-center gap-2 text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to your team
        </Link>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsWebTesterOpen(true)}
            className="border-violet-200 text-violet-700 dark:border-violet-900 dark:text-violet-300 hover:bg-violet-50 flex items-center gap-1.5"
          >
            <Headphones className="h-3.5 w-3.5" />
            Web voice test
          </Button>

          <Button
            size="sm"
            onClick={() => setIsTestCallOpen(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Test dial agent
          </Button>
        </div>
      </div>

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950 text-violet-600">
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-stone-900 dark:text-white">{agent.name}</h1>
              <Badge variant={status === "active" ? "success" : "secondary"}>
                {status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-stone-400 font-mono mt-0.5">
              Agent ID: {agent.id}
            </p>
          </div>
        </div>

        {/* Assigned Number Pill */}
        <div className="flex items-center gap-3">
          {assignedNumber ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
              <span className="text-[11px] text-stone-400 block">Attached Number</span>
              <span className="font-mono text-sm font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3.5 w-3.5 text-violet-500" />
                {assignedNumber.phone_number}
              </span>
            </div>
          ) : (
            <Link
              href="/phone-numbers"
              className="text-xs flex items-center gap-1.5 border border-violet-200 rounded-md px-3 py-2 text-violet-600 hover:bg-violet-50"
            >
              Register Inbound Number
            </Link>
          )}
        </div>
      </div>

      {/* Editor Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Prompt & Person Configuration */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prompt & Personality</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    System Prompt Instructions
                  </label>
                  <Textarea
                    rows={8}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    required
                    className="font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Introduction Greeting (Leave blank for callee to speak first)
                  </label>
                  <Input
                    value={introduction}
                    onChange={(e) => setIntroduction(e.target.value)}
                    placeholder="e.g. Hello! This is Sarah from Acme Dental..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Voice Model & Settings */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Voice Model & Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Agent Name
                  </label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Indian Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
                  >
                    {INDIAN_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Cartesia Sonic Voice
                  </label>
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
                  >
                    {CARTESIA_VOICE_PRESETS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.accent})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Operational Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "active" | "paused")}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
                  >
                    <option value="active">Active (Handling calls)</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : savedSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>{savedSuccess ? "Saved Successfully!" : "Save Changes"}</span>
                  </Button>
                  {saveError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{saveError}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      {/* Performance for this agent specifically */}
      <div className="space-y-4 pt-4">
        <h3 className="text-base font-bold text-stone-900 dark:text-white">
          Calls Handled by {agent.name}
        </h3>
        <CallsTable initialCalls={calls} />
      </div>

      <TestCallDialog
        isOpen={isTestCallOpen}
        onClose={() => setIsTestCallOpen(false)}
        defaultAgentId={agent.id}
      />

      <WebVoiceTesterModal
        isOpen={isWebTesterOpen}
        onClose={() => setIsWebTesterOpen(false)}
        agent={agent}
      />
    </div>
  );
}
