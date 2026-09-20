"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { INDIAN_LANGUAGES, CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";
import { buildSystemPrompt } from "@/lib/prompt-builder";
import { BrowserCallPlayground } from "./browser-call-playground";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import { OPENROUTER_GEMINI_25_FLASH } from "@/lib/types";
import {
  Sparkles,
  Languages,
  Volume2,
  Play,
  Square,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Bot,
  RefreshCw,
  Rocket,
  Check,
  Phone,
  PhoneCall,
  PlusCircle,
} from "lucide-react";

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  accent: string;
  description: string;
  preview_url: string;
}

const TEMPLATES = [
  {
    title: "Appointment Booking",
    desc: "Dental/clinic reception: Call patients due for routine checkups, verify insurance, and schedule appointment slots.",
    goal: "Confirm interest and book a 15-minute slot for this week.",
  },
  {
    title: "Lead Qualification",
    desc: "Solar energy solutions: Qualify homeowners with electric bills over ₹5,000/month for rooftop clean energy subsidies.",
    goal: "Confirm homeownership and schedule a free site inspection visit.",
  },
  {
    title: "E-Commerce Support",
    desc: "Retail store customer service: Assist buyers with order tracking, return requests, and address verifications.",
    goal: "Resolve order queries and provide tracking details accurately.",
  },
  {
    title: "Real Estate Inquiry",
    desc: "Property developers: Connect with prospective home buyers, explain 2BHK/3BHK unit configurations, and book property tours.",
    goal: "Qualify budget and schedule an in-person site visit.",
  },
];

export function AgentBuilderWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Wizard state
  const [businessDescription, setBusinessDescription] = useState("");
  const [callGoal, setCallGoal] = useState("");
  const [language, setLanguage] = useState("hi");
  const [selectedVoiceId, setSelectedVoiceId] = useState(CARTESIA_VOICE_PRESETS[0].id);
  const [agentName, setAgentName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [llmProvider, setLlmProvider] = useState<"openrouter">("openrouter");
  const [llmModel, setLlmModel] = useState(OPENROUTER_GEMINI_25_FLASH);
  const [enabledTools, setEnabledTools] = useState<string[]>(["check_availability", "pricing_lookup"]);

  // Voices loading & audio preview state
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Prompt generation state
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Deployment state
  const [deploying, setDeploying] = useState(false);
  const [deployedAgent, setDeployedAgent] = useState<{
    id: string;
    cartesia_agent_id?: string;
    name: string;
    language: string;
    voice_id: string;
  } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const [assignedNumber, setAssignedNumber] = useState<string | null>(null);

  // Fetch voices for selected language
  useEffect(() => {
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    setLoadingVoices(true);
    fetch(`/api/voices?language=${language}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setVoices(data.voices || []);
          if (data.voices?.length > 0) {
            setSelectedVoiceId((currentVoiceId) =>
              data.voices.some((voice: { id: string }) => voice.id === currentVoiceId)
                ? currentVoiceId
                : data.voices[0].id
            );
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (isMounted) setLoadingVoices(false);
      });

    return () => {
      isMounted = false;
    };
  }, [language]);

  // Handle preview audio playback (single active player)
  const handlePlayPreview = (voiceId: string, previewUrl: string) => {
    if (playingVoiceId === voiceId && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setPlayingVoiceId(null);
      return;
    }

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = previewUrl;
      audioPreviewRef.current.play().catch(() => {});
      setPlayingVoiceId(voiceId);
      audioPreviewRef.current.onended = () => setPlayingVoiceId(null);
      audioPreviewRef.current.onerror = () => setPlayingVoiceId(null);
    }
  };

  // Generate structured prompt (Step 1 & 2 -> Step 4)
  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    const fallbackText = buildSystemPrompt({
      businessDescription,
      language,
      goal: callGoal,
    });
    const defaultName =
      agentName.trim() ||
      (businessDescription
        ? businessDescription.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        : "") ||
      `agent-${language}-${Date.now().toString().slice(-4)}`;

    if (!agentName) {
      setAgentName(defaultName);
    }

    try {
      const res = await fetch("/api/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_description: businessDescription || "AI voice assistant",
          language,
          goal: callGoal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.structured_prompt) {
          setSystemPrompt(data.structured_prompt);
          return;
        }
      }
      // If endpoint failed or returned empty prompt, use built-in fallback
      if (!systemPrompt) {
        setSystemPrompt(fallbackText);
      }
    } catch (err) {
      console.warn("Prompt generation error, using fallback structuring engine:", err);
      if (!systemPrompt) {
        setSystemPrompt(fallbackText);
      }
    } finally {
      setGeneratingPrompt(false);
    }
  };

  // Step transitions
  const goToStep = async (step: number) => {
    // If moving to step 4 and prompt not generated yet, auto-generate
    if (step === 4 && (!systemPrompt || currentStep < 4)) {
      await handleGeneratePrompt();
    }
    setCurrentStep(step);
  };

  // Deploy agent (Step 5)
  const handleDeployAgent = async () => {
    setDeploying(true);
    setDeployError(null);

    const effectivePrompt =
      systemPrompt.trim() ||
      buildSystemPrompt({
        businessDescription,
        language,
        goal: callGoal,
      });

    const effectiveName =
      agentName.trim() ||
      (businessDescription
        ? businessDescription.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        : "") ||
      `agent-${language}-${Date.now().toString().slice(-4)}`;

    const effectiveVoiceId = selectedVoiceId || CARTESIA_VOICE_PRESETS[0].id;

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: effectiveName,
          voiceId: effectiveVoiceId,
          language,
          systemPrompt: effectivePrompt,
          introduction,
          llmProvider,
          llmModel,
          enabledTools,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Agent deployment failed");
      }

      setSystemPrompt(effectivePrompt);
      setAgentName(effectiveName);
      setSelectedVoiceId(effectiveVoiceId);
      setDeployedAgent(data.agent);
      if (data.agent.phone_numbers?.[0]?.phone_number) {
        setAssignedNumber(data.agent.phone_numbers[0].phone_number);
      }
      setCurrentStep(5);
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  // Number registration needs the real carrier-owned number; the dashboard
  // validates and attaches it instead of fabricating a nonfunctional line.
  const handleAttachNumber = async () => {
    router.push("/phone-numbers");
  };

  const selectedVoice = voices.find((v) => v.id === selectedVoiceId) || {
    name: "Cartesia Indian Sonic Voice",
    accent: "Indian Accent",
  };

  const selectedLangObj = INDIAN_LANGUAGES.find((l) => l.code === language) || INDIAN_LANGUAGES[0];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hidden audio tag for voice previews */}
      <audio ref={audioPreviewRef} />

      {/* Stepper Progress Header */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950 shadow-xs">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: "Describe Business" },
            { num: 2, label: "Language" },
            { num: 3, label: "Pick Voice" },
            { num: 4, label: "Review Prompt" },
            { num: 5, label: "Deploy & Playground" },
          ].map((s, idx) => {
            const isCompleted = currentStep > s.num;
            const isCurrent = currentStep === s.num;

            return (
              <div key={s.num} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => s.num < currentStep && setCurrentStep(s.num)}
                  disabled={s.num > currentStep && !deployedAgent}
                  className={`flex items-center gap-2 text-xs font-semibold transition-all ${
                    isCurrent
                      ? "text-violet-600 dark:text-violet-400"
                      : isCompleted
                      ? "text-emerald-600 dark:text-emerald-400 cursor-pointer"
                      : "text-stone-400 cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      isCurrent
                        ? "bg-violet-600 text-white shadow-sm ring-4 ring-violet-100 dark:ring-violet-950"
                        : isCompleted
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-100 text-stone-500 dark:bg-stone-800"
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : s.num}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>

                {idx < 4 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 ${
                      currentStep > s.num ? "bg-emerald-500" : "bg-stone-200 dark:bg-stone-800"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Describe Business */}
      {currentStep === 1 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-violet-600" />
              <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                Step 1: Describe Your Business
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Tell us in your own words what your business does and what you want this agent to accomplish on customer calls.
            </p>
          </div>

          {/* Quick industry templates */}
          <div>
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-2">
              Or pick an industry template to start:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.title}
                  onClick={() => {
                    setBusinessDescription(tmpl.desc);
                    setCallGoal(tmpl.goal);
                  }}
                  className="cursor-pointer rounded-xl border border-stone-200 p-3 hover:border-violet-400 hover:bg-violet-50/40 dark:border-stone-800 dark:hover:bg-violet-950/20 transition-all"
                >
                  <span className="font-semibold text-xs text-stone-900 dark:text-white block mb-1">
                    {tmpl.title}
                  </span>
                  <p className="text-[11px] text-stone-500 line-clamp-2">{tmpl.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
              Business Overview & Services
            </label>
            <Textarea
              rows={4}
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="e.g. Acme Health Clinic provides dental checkups and cosmetic dentistry in Mumbai. We need an agent to call patients due for their 6-month hygiene recall and schedule morning appointments."
              className="text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
              Primary Call Goal (Optional)
            </label>
            <Input
              value={callGoal}
              onChange={(e) => setCallGoal(e.target.value)}
              placeholder="e.g. Confirm customer interest and book a 15-minute consultation."
              className="text-xs"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => goToStep(2)}
              disabled={!businessDescription.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 text-xs"
            >
              <span>Next: Select Language</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: Language Selection */}
      {currentStep === 2 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Languages className="h-5 w-5 text-violet-600" />
              <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                Step 2: Choose Indian Language
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Select the primary language your AI voice agent will speak on telephone calls.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {INDIAN_LANGUAGES.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <div
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`cursor-pointer rounded-xl border p-3.5 text-center transition-all ${
                    isSelected
                      ? "border-violet-600 bg-violet-50/70 ring-2 ring-violet-500/30 dark:bg-violet-950/40"
                      : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950"
                  }`}
                >
                  <span className="text-lg block mb-1 font-bold text-violet-600 dark:text-violet-400">
                    {lang.nativeName}
                  </span>
                  <span className="font-semibold text-xs text-stone-800 dark:text-stone-200">
                    {lang.name}
                  </span>
                  <span className="text-[10px] text-stone-400 block mt-0.5 uppercase font-mono">
                    {lang.code}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(1)}
              className="text-xs flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <Button
              onClick={() => goToStep(3)}
              className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 text-xs"
            >
              <span>Next: Pick Voice Model</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Voice Picker with Playable Previews */}
      {currentStep === 3 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Volume2 className="h-5 w-5 text-violet-600" />
              <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                Step 3: Browse & Preview Indian Voices
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Listen to native Indian voices powered by Cartesia Sonic-3. Click ▶ to hear an instant preview.
            </p>
          </div>

          {loadingVoices ? (
            <div className="py-16 flex flex-col items-center justify-center text-stone-400">
              <Loader2 className="h-7 w-7 animate-spin text-violet-600 mb-2" />
              <span className="text-xs">Fetching Cartesia voice catalog...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto pr-1">
              {voices.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                const isPlaying = playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    className={`rounded-xl border p-4 transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-violet-600 bg-violet-50/60 ring-2 ring-violet-500/20 dark:bg-violet-950/40"
                        : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-xs text-stone-900 dark:text-white">
                            {voice.name}
                          </h4>
                          <span className="text-[10px] text-violet-600 font-medium">{voice.accent}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize py-0 px-1.5">
                          {voice.gender}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[11px] text-stone-500 line-clamp-2">{voice.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handlePlayPreview(voice.id, voice.preview_url)}
                        className={`h-7 px-2.5 text-xs flex items-center gap-1.5 ${
                          isPlaying
                            ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950"
                            : ""
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Square className="h-3 w-3 fill-violet-600" />
                            <span className="font-semibold text-[11px]">Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-stone-700 dark:fill-stone-300" />
                            <span className="text-[11px]">Preview</span>
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setSelectedVoiceId(voice.id)}
                        className={`h-7 px-3 text-xs ${
                          isSelected
                            ? "bg-violet-600 text-white hover:bg-violet-700"
                            : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200"
                        }`}
                      >
                        {isSelected ? "Selected" : "Choose"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {deployError && currentStep === 3 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {deployError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(2)}
              className="text-xs flex items-center gap-1.5 w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => goToStep(4)}
                disabled={generatingPrompt || deploying}
                className="text-xs flex items-center gap-1.5 border-violet-200 text-violet-700 dark:border-violet-900 dark:text-violet-300 hover:bg-violet-50 flex-1 sm:flex-none"
              >
                {generatingPrompt ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Structuring Prompt...</span>
                  </>
                ) : (
                  <>
                    <span>Next: Customize Prompt</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <Button
                onClick={handleDeployAgent}
                disabled={deploying || generatingPrompt}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 text-xs h-10 px-5 shadow-sm font-semibold flex-1 sm:flex-none"
              >
                {deploying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Publishing agent...</span>
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    <span>Publish & Deploy Agent</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Review Generated System Prompt */}
      {currentStep === 4 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950 space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="h-5 w-5 text-violet-600" />
                  <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                    Step 4: Review Structured System Prompt
                  </h2>
                </div>
                <p className="text-xs text-stone-500">
                  We transformed your business description into a complete 6-section telephony agent prompt. Review or edit before deploying.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={handleGeneratePrompt}
                disabled={generatingPrompt}
                className="text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${generatingPrompt ? "animate-spin" : ""}`} />
                <span>Regenerate</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Agent Identifier
              </label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. acme-receptionist"
                className="text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Target Language & Voice
              </label>
              <div className="rounded-lg bg-stone-50 p-2 text-xs border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between">
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  {selectedVoice.name}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {selectedLangObj.name}
                </Badge>
              </div>
            </div>
          </div>

          {/* Structured Prompt Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Agent System Prompt (Editable)
              </label>
              {generatingPrompt && (
                <span className="text-[11px] text-violet-600 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Structuring prompt...
                </span>
              )}
            </div>
            <Textarea
              rows={12}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="font-mono text-xs leading-relaxed"
              required
            />
          </div>

          {/* Optional Opening Greeting */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Custom Opening Greeting (Leave blank for callee to say &quot;Hello&quot; first)
            </label>
            <Input
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              placeholder="e.g. नमस्ते! मैं सिगुलोन केयर से बात कर रहा हूँ।"
              className="text-xs"
            />
          </div>

          {/* Voice Intelligence & Live Tools Configuration */}
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 dark:border-violet-950 dark:bg-violet-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-violet-950 dark:text-violet-200">
                  Voice Intelligence & Live Tools
                </h4>
                <p className="text-[11px] text-violet-700 dark:text-violet-400">
                  Select the reasoning engine and live in-call tools enabled for this voice agent.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] bg-white dark:bg-stone-900 border-violet-200 text-violet-600 font-mono">
                Voice Runtime
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  LLM Intelligence Engine
                </label>
                <select
                  value={llmProvider}
                  onChange={() => setLlmProvider("openrouter")}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-white"
                >
                  <option value="openrouter">OpenRouter (Gemini 2.5 Flash - Connected)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  In-Call Live Tools
                </label>
                <div className="space-y-2 pt-0.5">
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
                    <span>💰 In-Call Pricing & Estimate Lookup</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {deployError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {deployError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(3)}
              className="text-xs flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <Button
              onClick={handleDeployAgent}
              disabled={deploying}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 text-xs h-10 px-5 shadow-sm font-semibold"
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Publishing to Cartesia Line...</span>
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  <span>Publish & Deploy Agent</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: Deploy & In-Browser Playground */}
      {currentStep === 5 && deployedAgent && (
        <div className="space-y-6">
          {/* Success Banner */}
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 dark:bg-emerald-950/30 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-emerald-950 dark:text-emerald-200">
                    Agent Successfully Published & Deployed!
                  </h3>
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] uppercase font-bold">
                    Active & Live
                  </Badge>
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Agent <strong>{deployedAgent.name}</strong> is live and serving calls through the Sigulon voice runtime.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(4)}
                className="text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300"
              >
                Edit Configuration
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/agents")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
              >
                <Bot className="h-3.5 w-3.5" />
                View in Voice Agents List
              </Button>
            </div>
          </div>

          {/* Telephony Status & Live Actions Bar */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[11px] text-stone-400 block font-medium">Telephony Inbound / Outbound Line</span>
                {assignedNumber ? (
                  <span className="text-xs font-bold font-mono text-stone-900 dark:text-white">
                    {assignedNumber}
                  </span>
                ) : (
                  <span className="text-xs text-stone-500 italic">No virtual phone number attached</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!assignedNumber && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAttachNumber}
                  className="text-xs h-8 px-3 border-violet-200 text-violet-600 hover:bg-violet-50 flex items-center gap-1.5"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Register Telephony Line
                </Button>
              )}

              <Button
                size="sm"
                onClick={() => setIsTestCallOpen(true)}
                className="text-xs h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 shadow-xs"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                Phone Dial Test
              </Button>
            </div>
          </div>

          {/* Interactive In-Browser Playground Simulator */}
          <BrowserCallPlayground
            agentId={deployedAgent.id}
            agentName={deployedAgent.name}
            language={deployedAgent.language}
            voiceName={selectedVoice.name}
            voiceId={selectedVoiceId}
            systemPrompt={systemPrompt}
          />

          <TestCallDialog
            isOpen={isTestCallOpen}
            onClose={() => setIsTestCallOpen(false)}
            defaultAgentId={deployedAgent.id}
          />
        </div>
      )}
    </div>
  );
}
