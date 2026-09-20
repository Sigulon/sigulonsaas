"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { VoiceAgent } from "@/lib/types";
import { CARTESIA_VOICE_PRESETS, INDIAN_LANGUAGES } from "@/lib/cartesia";
import { Sparkles, Loader2, Volume2, Languages, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OPENROUTER_GEMINI_25_FLASH } from "@/lib/types";

interface AgentEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agent?: VoiceAgent | null;
  onSaved: () => void;
}

export function AgentEditorDialog({
  isOpen,
  onClose,
  agent,
  onSaved,
}: AgentEditorDialogProps) {
  const isEditing = Boolean(agent);

  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState(CARTESIA_VOICE_PRESETS[0].id);
  const [language, setLanguage] = useState("hi");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [calleeSpeaksFirst, setCalleeSpeaksFirst] = useState(true);
  const [customIntroduction, setCustomIntroduction] = useState("");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [llmProvider, setLlmProvider] = useState<"openrouter">("openrouter");
  const [llmModel, setLlmModel] = useState(OPENROUTER_GEMINI_25_FLASH);
  const [enabledTools, setEnabledTools] = useState<string[]>(["check_availability", "pricing_lookup"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- form reset on agent/open change.
      setName(agent.name);
      setName(agent.name);
      setVoiceId(agent.voice_id);
      setLanguage(agent.language || "hi");
      setSystemPrompt(agent.system_prompt);
      setCalleeSpeaksFirst(!agent.introduction);
      setCustomIntroduction(agent.introduction || "");
      setStatus(agent.status === "paused" ? "paused" : "active");
      setLlmProvider("openrouter");
      setLlmModel(OPENROUTER_GEMINI_25_FLASH);
      setEnabledTools(agent.enabled_tools || ["check_availability", "pricing_lookup"]);
    } else {
      setName("");
      setVoiceId(CARTESIA_VOICE_PRESETS[0].id);
      setLanguage("hi");
      setSystemPrompt(
        "You are an AI customer coordinator speaking in Hindi. Your goal is to politely assist the caller, answer questions about our services clearly and concisely, and help them schedule a callback or appointment."
      );
      setCalleeSpeaksFirst(true);
      setCustomIntroduction("");
      setStatus("active");
      setLlmProvider("openrouter");
      setLlmModel(OPENROUTER_GEMINI_25_FLASH);
      setEnabledTools(["check_availability", "pricing_lookup"]);
    }
    setError(null);
  }, [agent, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const introduction = calleeSpeaksFirst ? "" : customIntroduction;

    try {
      const url = isEditing ? `/api/agents/${agent?.id}` : "/api/agents";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          voiceId,
          language,
          systemPrompt,
          introduction,
          status,
          llmProvider,
          llmModel,
          enabledTools,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save voice agent");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Configure Agent: ${agent?.name}` : "Create AI Voice Calling Agent"}
          description="Configure your agent persona, voice model, language, and behavioral prompt."
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Agent Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. hindi-customer-agent"
              required
            />
            <span className="text-[10px] text-stone-400 mt-1 block">
              Alphanumeric characters, dashes and underscores.
            </span>
          </div>

          {/* Indian Language Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1 flex items-center gap-1">
              <Languages className="h-3.5 w-3.5 text-violet-600" />
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
        </div>

        {/* Indian Voice Selection */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5 flex items-center gap-1">
            <Volume2 className="h-3.5 w-3.5 text-violet-600" />
            Voice Model
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
            {CARTESIA_VOICE_PRESETS.map((voice) => {
              const isSelected = voiceId === voice.id;
              return (
                <div
                  key={voice.id}
                  onClick={() => setVoiceId(voice.id)}
                  className={`cursor-pointer rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? "border-violet-600 bg-violet-50/60 ring-2 ring-violet-500/20 dark:bg-violet-950/40"
                      : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-stone-900 dark:text-white flex items-center gap-1.5">
                      {voice.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-violet-600 font-medium">{voice.accent}</span>
                  <p className="mt-1 text-[11px] text-stone-500 line-clamp-2">{voice.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              Agent Personality & System Prompt
            </label>
            <span className="text-[11px] text-stone-400">Specify language rules, guidelines, & goals</span>
          </div>
          <Textarea
            rows={5}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Define what the agent says, tone in Hindi/English, questions to ask..."
            required
            className="font-mono text-xs"
          />
        </div>

        {/* Introduction / Turn-taking convention */}
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-stone-800 dark:bg-stone-900/50 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                Outbound Turn-taking: Callee Speaks First
              </span>
              <p className="text-[11px] text-stone-500">
                Keep the opening greeting empty for outbound calls so the agent waits for the human to answer and say &quot;Hello?&quot;.
              </p>
            </div>
            <input
              type="checkbox"
              checked={calleeSpeaksFirst}
              onChange={(e) => setCalleeSpeaksFirst(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
            />
          </div>

          {!calleeSpeaksFirst && (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Custom Introduction Greeting
              </label>
              <Input
                value={customIntroduction}
                onChange={(e) => setCustomIntroduction(e.target.value)}
                placeholder="नमस्ते! मैं सिगुलोन से बात कर रहा हूँ..."
              />
            </div>
          )}
        </div>

        {/* Voice Intelligence & Tools Configuration */}
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5 dark:border-violet-950 dark:bg-violet-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-violet-950 dark:text-violet-200">
              Voice Intelligence & Tools
            </span>
            <Badge variant="outline" className="text-[10px] bg-white dark:bg-stone-900 border-violet-200 text-violet-600 font-mono">
              Line SDK Runtime
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                LLM Intelligence Engine
              </label>
                <select
                value={llmProvider}
                onChange={() => setLlmProvider("openrouter")}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-white"
              >
                <option value="openrouter">OpenRouter (Gemini 2.5 Flash - Connected)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                In-Call Live Tools
              </label>
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledTools.includes("check_availability")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEnabledTools([...enabledTools, "check_availability"]);
                      } else {
                        setEnabledTools(enabledTools.filter((t) => t !== "check_availability"));
                      }
                    }}
                    className="rounded border-stone-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>📅 Check Appointment Availability</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledTools.includes("pricing_lookup")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEnabledTools([...enabledTools, "pricing_lookup"]);
                      } else {
                        setEnabledTools(enabledTools.filter((t) => t !== "pricing_lookup"));
                      }
                    }}
                    className="rounded border-stone-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>💰 In-Call Pricing & Estimates</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500">Status:</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "paused")}
                className="rounded-md border border-stone-200 text-xs px-2 py-1 dark:border-stone-800 dark:bg-stone-900"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          ) : <div />}

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving agent...
                </>
              ) : isEditing ? (
                "Save Configuration"
              ) : (
                "Create Agent"
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
