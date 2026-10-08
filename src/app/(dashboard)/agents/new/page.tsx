"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Zap,
  PhoneCall,
  Check,
  AlertTriangle,
  RotateCcw,
  Save,
  Loader2,
  FileText,
  Network,
  Bot,
  Globe,
  Briefcase,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AgentBundle, AgentBundleVariable } from "@/lib/agent-bundle/schema";
import { validateAgentBundle, analyzeBundleVariables } from "@/lib/agent-bundle/validator";
import { ScriptEditor } from "@/components/editor/script-editor";
import { VariablesPanel } from "@/components/editor/variables-panel";
import { FlowGraph } from "@/components/editor/flow-graph";

interface LanguageOption {
  code: string;
  label: string;
  englishLabel: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: "te-IN", label: "తెలుగు", englishLabel: "Telugu" },
  { code: "hi-IN", label: "हिन्दी", englishLabel: "Hindi" },
  { code: "ta-IN", label: "தமிழ்", englishLabel: "Tamil" },
  { code: "kn-IN", label: "ಕನ್ನಡ", englishLabel: "Kannada" },
  { code: "ml-IN", label: "മലയാളം", englishLabel: "Malayalam" },
  { code: "mr-IN", label: "मराठी", englishLabel: "Marathi" },
  { code: "en-IN", label: "English", englishLabel: "English" },
];

interface IndustryChip {
  id: string;
  label: string;
  prompt: string;
}

const INDUSTRY_CHIPS: IndustryChip[] = [
  {
    id: "real-estate",
    label: "🏡 Real estate",
    prompt:
      "Call every new enquiry from my Instagram ad for 2BHK and 3BHK luxury apartments, understand what they need and their budget, and book a site visit for this weekend.",
  },
  {
    id: "coaching",
    label: "📚 Coaching & tuition",
    prompt:
      "Call students who enquired about our IIT-JEE and NEET coaching programs, understand their target exam year, and book a free counseling call with our senior mentor.",
  },
  {
    id: "hospital",
    label: "🏥 Hospital & clinic",
    prompt:
      "Call patients requesting a doctor consultation, confirm the required medical department, check whether they prefer morning or evening slots, and confirm the visit.",
  },
  {
    id: "auto",
    label: "🚗 Car & bike dealer",
    prompt:
      "Call leads interested in test-driving our new vehicle, check their preferred model and fuel type, and schedule an executive home test drive at their convenience.",
  },
];

function checkLanguageConsistency(languageCode: string, bundle: AgentBundle): string | null {
  const allText = [
    bundle.first_response,
    ...bundle.sections.map((s) => s.prompt),
  ].join(" ");

  const teluguRegex = /[\u0C00-\u0C7F]/;
  const devanagariRegex = /[\u0900-\u097F]/;
  const tamilRegex = /[\u0B80-\u0BFF]/;
  const kannadaRegex = /[\u0C80-\u0CFF]/;
  const malayalamRegex = /[\u0D00-\u0D7F]/;

  const hasTelugu = teluguRegex.test(allText);
  const hasDevanagari = devanagariRegex.test(allText);
  const hasTamil = tamilRegex.test(allText);
  const hasKannada = kannadaRegex.test(allText);
  const hasMalayalam = malayalamRegex.test(allText);

  if (languageCode.startsWith("te")) {
    if (hasDevanagari || hasTamil || hasKannada || hasMalayalam) {
      return "Notice: Agent language is set to Telugu (te-IN), but parts of the script contain other Indic scripts. Ensure the script text matches Telugu.";
    }
  } else if (languageCode.startsWith("hi")) {
    if (hasTelugu || hasTamil || hasKannada || hasMalayalam) {
      return "Notice: Agent language is set to Hindi (hi-IN), but parts of the script contain other Indic scripts. Ensure the script text matches Hindi.";
    }
  } else if (languageCode.startsWith("ta")) {
    if (hasTelugu || hasDevanagari || hasKannada || hasMalayalam) {
      return "Notice: Agent language is set to Tamil (ta-IN), but parts of the script contain other Indic scripts.";
    }
  } else if (languageCode.startsWith("kn")) {
    if (hasTelugu || hasDevanagari || hasTamil || hasMalayalam) {
      return "Notice: Agent language is set to Kannada (kn-IN), but parts of the script contain other Indic scripts.";
    }
  } else if (languageCode.startsWith("ml")) {
    if (hasTelugu || hasDevanagari || hasTamil || hasKannada) {
      return "Notice: Agent language is set to Malayalam (ml-IN), but parts of the script contain other Indic scripts.";
    }
  } else if (languageCode.startsWith("mr")) {
    if (hasTelugu || hasTamil || hasKannada || hasMalayalam) {
      return "Notice: Agent language is set to Marathi (mr-IN), but parts of the script contain other Indic scripts.";
    }
  }
  return null;
}

export default function NewAgentPage() {
  const router = useRouter();

  // Stage: "input" (Stage A) | "script" (Stage B)
  const [stage, setStage] = useState<"input" | "script">("input");

  // Stage A Input States
  const [mode, setMode] = useState<"instant" | "bulk">("instant");
  const [language, setLanguage] = useState<string>("te-IN");
  const [description, setDescription] = useState<string>("");
  const [agentName, setAgentName] = useState<string>("");

  // Generation Progress & State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>("understanding");
  const [generationMessage, setGenerationMessage] = useState<string>("");
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Stage B Script View States
  const [bundle, setBundle] = useState<AgentBundle | null>(null);
  const [activeTab, setActiveTab] = useState<"script" | "graph">("script");
  const [highlightedSectionKey, setHighlightedSectionKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  // Validation State for Bundle
  const validationResult = useMemo(() => {
    if (!bundle) return { valid: false, errors: [] };
    return validateAgentBundle(bundle);
  }, [bundle]);

  const variableAnalysis = useMemo(() => {
    if (!bundle) {
      return { usedVars: new Set<string>(), definedVars: new Set<string>(), unusedVars: [], undefinedVars: [] };
    }
    return analyzeBundleVariables(bundle);
  }, [bundle]);

  const languageMismatchWarning = useMemo(() => {
    if (!bundle) return null;
    return checkLanguageConsistency(bundle.exported_from.language, bundle);
  }, [bundle]);

  // Handle generation via POST /api/agents/generate
  const handleGenerate = async () => {
    const trimmedPrompt = description.trim();
    if (!trimmedPrompt || trimmedPrompt.length < 10) {
      setGenerationError("Please provide a prompt description of at least 10 characters.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStep("understanding");
    setGenerationMessage("Analyzing requirements and intent…");

    try {
      // Use SSE streaming endpoint for responsive step-by-step progress
      const response = await fetch("/api/agents/generate?stream=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          description: trimmedPrompt,
          mode,
          language,
          agentName: agentName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Generation failed (${response.status})`);
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalBundle: AgentBundle | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              const dataStr = trimmed.slice(5).trim();
              try {
                const event = JSON.parse(dataStr);
                if (event.step) {
                  setGenerationStep(event.step);
                }
                if (event.message) {
                  setGenerationMessage(event.message);
                }
                if (event.step === "complete" && event.bundle) {
                  finalBundle = event.bundle;
                }
                if (event.step === "error") {
                  throw new Error(event.error || "Generation error occurred");
                }
              } catch (e: any) {
                if (e.message && e.message !== "Unexpected end of JSON input") {
                  console.error("Stream parse error:", e);
                }
              }
            }
          }
        }

        if (finalBundle) {
          setBundle(finalBundle);
          setStage("script");
          return;
        }
      }

      // Non-streaming fallback if stream didn't deliver complete bundle
      const fallbackRes = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmedPrompt,
          mode,
          language,
          agentName: agentName.trim() || undefined,
        }),
      });

      if (!fallbackRes.ok) {
        const errJson = await fallbackRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate agent bundle");
      }

      const resData = await fallbackRes.json();
      if (resData.bundle) {
        setBundle(resData.bundle);
        setStage("script");
      } else {
        throw new Error("No bundle returned from generator");
      }
    } catch (err: any) {
      console.error("Agent generation error:", err);
      setGenerationError(err.message || "Failed to generate agent script. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Update bundle in state
  const handleUpdateBundle = (updated: AgentBundle) => {
    setBundle(updated);
  };

  const handleUpdateVariables = (newVars: AgentBundleVariable[]) => {
    if (!bundle) return;
    setBundle({
      ...bundle,
      variables: newVars,
    });
  };

  // Save agent to database
  const handleSaveAgent = async () => {
    if (!bundle) return;

    // Strict client-side validation
    const validation = validateAgentBundle(bundle);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setSaveError("Please fix validation errors before saving the agent.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setFieldErrors([]);

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bundle.exported_from.employee_name || "AI Agent",
          bundle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details && Array.isArray(data.details)) {
          setFieldErrors(data.details);
        }
        throw new Error(data.error || "Failed to create agent");
      }

      const createdAgentId = data.agent?.id || data.agent?._id;
      if (createdAgentId) {
        router.push(`/agents/${createdAgentId}`);
      } else {
        router.push("/agents");
      }
    } catch (err: any) {
      console.error("Save agent error:", err);
      setSaveError(err.message || "Failed to save agent to MongoDB.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/agents"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-base">
                  {stage === "input" ? "Natural Language Agent Builder" : bundle?.exported_from.employee_name || "Agent Script"}
                </span>
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Bundle v2
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {stage === "input"
                  ? "Describe requirements in plain text to generate a telephony agent"
                  : `Mode: ${bundle?.exported_from.mode === "instant" ? "Instant Lead Calling" : "Bulk Calling"} • ${
                      LANGUAGES.find((l) => l.code === bundle?.exported_from.language)?.label || bundle?.exported_from.language
                    }`}
              </p>
            </div>
          </div>

          {stage === "script" && bundle && (
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStage("input")}
                className="text-xs h-9 text-slate-600 dark:text-slate-300"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Prompt / Settings
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="text-xs h-9 text-amber-600 border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Regenerating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Regenerate
                  </>
                )}
              </Button>

              <Button
                size="sm"
                onClick={handleSaveAgent}
                disabled={isSaving || !validationResult.valid}
                className="text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Saving Agent…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Agent
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 pt-6">
        {/* STAGE A: Natural-Language Input Form */}
        {stage === "input" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2 pb-2">
              <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-1">
                <Sparkles className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                What should your voice agent do?
              </h1>
              <p className="text-sm text-slate-500 max-w-lg mx-auto">
                Type what you want your agent to ask, confirm, or pitch. Our Indian telephony architect will create a full Bundle v2 script graph.
              </p>
            </div>

            {/* Stage A Controls Card */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <CardContent className="p-6 space-y-6">
                {/* Mode Selector Toggle */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Calling Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setMode("instant")}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        mode === "instant"
                          ? "border-amber-500 bg-amber-500/5 text-slate-900 dark:text-white shadow-sm ring-1 ring-amber-500/20"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-bold text-sm flex items-center gap-1.5">
                          <Zap className="h-4 w-4 text-amber-500" />
                          Instant Lead Calling
                        </span>
                        {mode === "instant" && (
                          <div className="h-4 w-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        Dials outbound within 15 seconds of an ad lead or webhook.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode("bulk")}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        mode === "bulk"
                          ? "border-amber-500 bg-amber-500/5 text-slate-900 dark:text-white shadow-sm ring-1 ring-amber-500/20"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-bold text-sm flex items-center gap-1.5">
                          <PhoneCall className="h-4 w-4 text-amber-500" />
                          Bulk Calling
                        </span>
                        {mode === "bulk" && (
                          <div className="h-4 w-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        High-throughput outbound campaigns from CSV lists.
                      </span>
                    </button>
                  </div>
                </div>

                {/* Language Pills */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      Agent Language
                    </label>
                    <span className="text-xs text-slate-400">
                      Scripts & responses will be crafted in this language
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => {
                      const isSelected = language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => setLanguage(lang.code)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-amber-500 text-slate-950 shadow-sm"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60"
                          }`}
                        >
                          <span>{lang.label}</span>
                          <span className="text-[10px] opacity-75 font-normal">({lang.englishLabel})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Industry Pre-Fill Chips */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      Quick Templates
                    </label>
                    <span className="text-xs text-slate-400">Click to pre-fill prompt below</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRY_CHIPS.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setDescription(chip.prompt)}
                        className="px-3 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800/80 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Natural Language Prompt Textarea */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>Agent Instructions & Script Goal</span>
                    <span className="text-slate-400 font-normal">{description.length} characters</span>
                  </label>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Call every new enquiry from my Instagram ad, ask what they need, and book a visit."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y"
                  />
                  <p className="text-xs text-slate-400">
                    Include who the caller is, what 2-3 questions to ask, how to confirm next steps, and any key FAQs.
                  </p>
                </div>

                {/* Error Banner */}
                {generationError && (
                  <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <span className="font-bold">Generation Error: </span>
                      {generationError}
                    </div>
                  </div>
                )}

                {/* Step Progress Display while Generating */}
                {isGenerating && (
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        {generationMessage || "Generating Agent Bundle v2…"}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-amber-600 dark:text-amber-400">
                        {generationStep}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: "understanding", label: "1. Intent" },
                        { key: "designing", label: "2. Graph" },
                        { key: "writing", label: "3. Script" },
                        { key: "validating", label: "4. Schema" },
                      ].map((s, idx) => {
                        const stepOrder = ["understanding", "designing", "writing", "validating"];
                        const currentIdx = stepOrder.indexOf(generationStep);
                        const isDone = currentIdx > idx;
                        const isCurrent = currentIdx === idx;
                        return (
                          <div
                            key={s.key}
                            className={`p-2 rounded-lg text-center text-[11px] font-semibold transition-colors ${
                              isDone
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : isCurrent
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse"
                                : "bg-slate-100 dark:bg-slate-800/60 text-slate-400"
                            }`}
                          >
                            {s.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating || description.trim().length < 5}
                    className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl shadow-sm flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Architecting Voice Agent…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Agent Script
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STAGE B: Editable Script View */}
        {stage === "script" && bundle && (
          <div className="space-y-6">
            {/* Top Info Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Agent Name:
                  </label>
                  <input
                    type="text"
                    value={bundle.exported_from.employee_name}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        exported_from: {
                          ...bundle.exported_from,
                          employee_name: e.target.value,
                        },
                      })
                    }
                    className="px-2.5 py-1 text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                    {bundle.exported_from.mode === "instant" ? "⚡ Instant Lead" : "📞 Bulk Campaign"}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                    {LANGUAGES.find((l) => l.code === bundle.exported_from.language)?.label || bundle.exported_from.language}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                    {bundle.sections.length} Sections
                  </span>
                </div>
              </div>

              {/* Validation Status Indicator */}
              <div className="flex items-center gap-2">
                {validationResult.valid ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Check className="h-3.5 w-3.5" />
                    <span>Bundle Valid</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{validationResult.errors.length} Schema Issue(s)</span>
                  </div>
                )}

                {/* View Switcher Tabs */}
                <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab("script")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                      activeTab === "script"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Script
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("graph")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                      activeTab === "graph"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Network className="h-3.5 w-3.5" />
                    Flow Graph
                  </button>
                </div>
              </div>
            </div>

            {/* Language Script Consistency Warning */}
            {languageMismatchWarning && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <span className="font-bold">Script Language Notice: </span>
                  {languageMismatchWarning}
                </div>
              </div>
            )}

            {/* Save Error or Validation Errors */}
            {(saveError || fieldErrors.length > 0) && (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs space-y-1.5">
                <div className="font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  {saveError || "Validation Errors:"}
                </div>
                {fieldErrors.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1">
                    {fieldErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Graph Tab View */}
            {activeTab === "graph" && (
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm p-4">
                <FlowGraph
                  bundle={bundle}
                  selectedSectionKey={highlightedSectionKey}
                  onSelectSection={(key) => {
                    setHighlightedSectionKey(key);
                    setActiveTab("script");
                  }}
                />
              </Card>
            )}

            {/* Script Tab View */}
            {activeTab === "script" && (
              <div className="space-y-6">
                {/* Numbered Section Cards via ScriptEditor */}
                <ScriptEditor
                  bundle={bundle}
                  highlightedSectionKey={highlightedSectionKey}
                  onUpdateBundle={handleUpdateBundle}
                />

                {/* Variables Panel */}
                <VariablesPanel
                  variables={bundle.variables}
                  unusedVariables={variableAnalysis.unusedVars}
                  undefinedVariables={variableAnalysis.undefinedVars}
                  onChangeVariables={handleUpdateVariables}
                />
              </div>
            )}

            {/* Bottom Action Footer */}
            <div className="sticky bottom-4 z-30 p-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {validationResult.valid ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Bundle v2 ready to save and execute
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Please address the {validationResult.errors.length} validation issue(s) above
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStage("input")}
                  className="text-xs text-slate-600 dark:text-slate-300"
                >
                  Edit Prompt
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="text-xs text-amber-600 border-amber-500/30 hover:bg-amber-50"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Regenerate
                </Button>

                <Button
                  size="sm"
                  onClick={handleSaveAgent}
                  disabled={isSaving || !validationResult.valid}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      Save Agent
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
