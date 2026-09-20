"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { INDIAN_LANGUAGES, CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";
import {
  AgentSpecification,
  AgentBundle,
  CallType,
  QualificationField,
  PreCallVariable,
  FAQItem,
} from "@sigulon/agent-schema/schema";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import {
  Sparkles,
  PhoneCall,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  Plus,
  Trash2,
  Volume2,
  Play,
  Square,
  RefreshCw,
  Code2,
  Workflow,
  Check,
  AlertCircle,
  Save,
  Rocket,
  Layers,
} from "lucide-react";

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  accent: string;
  description: string;
  preview_url: string;
}

type VoiceChoice = Omit<VoiceOption, "preview_url"> & { preview_url?: string };

const INDUSTRY_PRESETS = [
  {
    title: "Real Estate Property Consultant",
    callType: "outbound" as CallType,
    agentName: "Priya",
    agentRole: "Property Consultant",
    callPurpose: "Qualify interest in our new luxury gated villa project in Jubilee Hills",
    conversationGoal: "Schedule an on-site visit for this weekend",
    qualification: [
      {
        key: "bhk_preference",
        label: "Configuration Preference",
        type: "choice" as const,
        choices: ["3 BHK", "4 BHK", "Penthouse"],
        required: true,
        description: "Are you interested in a 3 BHK or 4 BHK villa?",
      },
      {
        key: "budget_range",
        label: "Target Budget",
        type: "text" as const,
        required: true,
        description: "What budget range are you targeting for this property?",
      },
      {
        key: "visit_day",
        label: "Preferred Visit Day",
        type: "choice" as const,
        choices: ["Saturday", "Sunday", "Weekday"],
        required: false,
        description: "Would Saturday or Sunday work better for a site tour?",
      },
    ],
    preCall: [
      { key: "lead_name", label: "Customer Full Name", source: "pre" as const },
      { key: "phone", label: "Contact Phone Number", source: "pre" as const },
    ],
    knowledge: "Greenfield Villas is a premium gated community with 45 signature villas starting from ₹3.5 Crores. Clubhouse includes pool, gym, tennis court, and banquet hall. Possession by December 2026.",
    faqs: [
      { question: "When is possession?", answer: "Possession is scheduled for December 2026 with approvals in place." },
      { question: "Are bank home loans available?", answer: "Yes, pre-approved by SBI, HDFC, and ICICI with attractive interest rates." },
    ],
    actions: ["Schedule site visit", "Send WhatsApp brochure"],
  },
  {
    title: "Clinic & Dental Appointment Desk",
    callType: "inbound" as CallType,
    agentName: "Dr. Ananya's Desk",
    agentRole: "Appointment Receptionist",
    callPurpose: "Assist callers with dental consultation booking, timings, and routine checkups",
    conversationGoal: "Book a consultation slot and confirm patient details",
    qualification: [
      {
        key: "chief_complaint",
        label: "Primary Issue",
        type: "text" as const,
        required: true,
        description: "Could you share the reason for your visit today?",
      },
      {
        key: "preferred_time",
        label: "Preferred Time Window",
        type: "choice" as const,
        choices: ["Morning (10am-1pm)", "Evening (5pm-8pm)"],
        required: true,
        description: "Do you prefer a morning or evening appointment?",
      },
    ],
    preCall: [
      { key: "phone", label: "Caller Phone", source: "pre" as const },
    ],
    knowledge: "Aesthetic Dental Care operates Monday through Saturday, 10 AM to 8 PM. General consultation fee is ₹500. Located at Banjara Hills Road No. 12.",
    faqs: [
      { question: "Do you take walk-ins?", answer: "We recommend prior appointments to avoid waiting, but emergencies are accommodated immediately." },
    ],
    actions: ["Book appointment slot", "Send SMS confirmation"],
  },
  {
    title: "Clean Energy / Solar Subsidies Lead Gen",
    callType: "outbound" as CallType,
    agentName: "Rahul",
    agentRole: "Clean Energy Advisor",
    callPurpose: "Qualify homeowners for government rooftop solar subsidies and energy bill savings",
    conversationGoal: "Confirm homeownership and book a free solar feasibility survey",
    qualification: [
      {
        key: "owns_home",
        label: "Home Ownership",
        type: "choice" as const,
        choices: ["Owns independent house", "Apartment / Tenant"],
        required: true,
        description: "Do you own an independent house or villa with your own roof?",
      },
      {
        key: "monthly_bill",
        label: "Average Monthly Power Bill",
        type: "choice" as const,
        choices: ["Under ₹3000", "₹3000 to ₹7000", "Above ₹7000"],
        required: true,
        description: "Approximately how much is your typical monthly electricity bill?",
      },
    ],
    preCall: [
      { key: "lead_name", label: "Homeowner Name", source: "pre" as const },
      { key: "city", label: "Location City", source: "pre" as const },
    ],
    knowledge: "PM Surya Ghar scheme offers up to ₹78,000 central subsidy for 3kW rooftop solar systems, reducing electricity bills by up to 80%.",
    faqs: [
      { question: "How much does it cost?", answer: "With current government subsidies, net cost starts around ₹65,000 for a 2kW system with 5-year payback." },
    ],
    actions: ["Book free roof survey", "Send subsidy details via WhatsApp"],
  },
];

const STEPS = [
  { step: 1, title: "Call Type", desc: "Inbound vs Outbound" },
  { step: 2, title: "Identity", desc: "Name & Persona" },
  { step: 3, title: "Purpose", desc: "Call Context" },
  { step: 4, title: "Goal", desc: "Desired Outcomes" },
  { step: 5, title: "Qualify", desc: "Questions to Collect" },
  { step: 6, title: "Known Info", desc: "Pre-call Variables" },
  { step: 7, title: "Knowledge", desc: "Facts & FAQs" },
  { step: 8, title: "Actions", desc: "Next Steps" },
  { step: 9, title: "Voice & Language", desc: "Language & Audio" },
  { step: 10, title: "Behavior", desc: "Style & Rules" },
  { step: 11, title: "Review", desc: "Generate Bundle" },
  { step: 12, title: "Preview", desc: "Visual Bundle & Publish" },
];

export function AgentCreationWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // 1. Call Type
  const [callType, setCallType] = useState<CallType>("outbound");

  // 2. Identity
  const [agentName, setAgentName] = useState("Priya");
  const [agentRole, setAgentRole] = useState("Property Consultant");
  const [companyName, setCompanyName] = useState("Greenfield Developers");

  // 3. Purpose
  const [callPurpose, setCallPurpose] = useState(
    "Qualify interest in our new luxury gated villa project in Jubilee Hills"
  );

  // 4. Goal
  const [conversationGoal, setConversationGoal] = useState("Schedule an on-site visit for this weekend");
  const [desiredOutcomes, setDesiredOutcomes] = useState<string[]>([
    "Schedule an on-site visit",
    "Confirm budget capability",
  ]);
  const [newOutcome, setNewOutcome] = useState("");

  // 5. Qualification fields (dynamic builder)
  const [qualificationFields, setQualificationFields] = useState<QualificationField[]>([
    {
      key: "bhk_preference",
      label: "Configuration Preference",
      type: "choice",
      choices: ["3 BHK", "4 BHK", "Penthouse"],
      required: true,
      description: "Are you looking for a 3 BHK or 4 BHK villa?",
    },
    {
      key: "budget_range",
      label: "Target Budget",
      type: "text",
      required: true,
      description: "What budget range are you targeting for this property?",
    },
  ]);

  // Field editor state
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "date" | "choice" | "boolean">("text");
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldDesc, setNewFieldDesc] = useState("");
  const [newFieldChoices, setNewFieldChoices] = useState("");

  // 6. Pre-call known variables
  const [preCallVariables, setPreCallVariables] = useState<PreCallVariable[]>([
    { key: "lead_name", label: "Customer Full Name", source: "pre", value_type: "text" },
    { key: "phone", label: "Phone Number", source: "pre", value_type: "text" },
  ]);
  const [newPreKey, setNewPreKey] = useState("");
  const [newPreLabel, setNewPreLabel] = useState("");

  // 7. Business knowledge & FAQs
  const [businessKnowledge, setBusinessKnowledge] = useState(
    "Greenfield Villas is a premium gated community with 45 signature villas starting from ₹3.5 Crores. Clubhouse includes pool, gym, tennis court, and banquet hall. Possession by December 2026."
  );
  const [faqs, setFaqs] = useState<FAQItem[]>([
    {
      question: "When is possession?",
      answer: "Possession starts in December 2026 with all regulatory clearances approved.",
    },
    {
      question: "Are bank home loans available?",
      answer: "Yes, pre-approved by SBI, HDFC, and ICICI with attractive interest rates.",
    },
  ]);
  const [newFaqQ, setNewFaqQ] = useState("");
  const [newFaqA, setNewFaqA] = useState("");

  // 8. Actions
  const [actions, setActions] = useState<string[]>([
    "Schedule site visit",
    "Send WhatsApp brochure",
  ]);
  const [newActionText, setNewActionText] = useState("");

  // 9. Language & Voice
  const [primaryLanguage, setPrimaryLanguage] = useState("en");
  const [secondaryLanguages, setSecondaryLanguages] = useState<string[]>(["te", "hi"]);
  const [autoLanguageSwitch, setAutoLanguageSwitch] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState(CARTESIA_VOICE_PRESETS[0].id);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // 10. Behavior & Style
  const [conversationStyle, setConversationStyle] = useState<"concise" | "balanced" | "conversational">("balanced");
  const [personalityTraits] = useState<string[]>([
    "Warm",
    "Professional",
    "Consultative",
  ]);
  const [rules, setRules] = useState<string[]>([
    "Never ask more than one question per turn.",
    "Do not repeat information already confirmed.",
    "Acknowledge user answers naturally before proceeding.",
    "Do not offer unauthorized discounts.",
    "Never insist if customer is busy; offer a polite callback.",
  ]);
  const [newRule, setNewRule] = useState("");

  // 11 & 12. Generation & Bundle preview
  const [generatingBundle, setGeneratingBundle] = useState(false);
  const [generatedBundle, setGeneratedBundle] = useState<AgentBundle | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [savedAgentId, setSavedAgentId] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);

  // Load voices
  useEffect(() => {
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch lifecycle owns the loading flag.
    setLoadingVoices(true);
    fetch(`/api/voices?language=${primaryLanguage}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setVoices(data.voices || []);
          // Default to the first voice only when nothing is selected yet —
          // never clobber an explicit user pick when the list refreshes.
          if (!selectedVoiceId && data.voices?.length > 0) {
            setSelectedVoiceId(data.voices[0].id);
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
  }, [primaryLanguage]);

  // Voice playback
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

  // Preset loader
  const loadPreset = (preset: typeof INDUSTRY_PRESETS[0]) => {
    setCallType(preset.callType);
    setAgentName(preset.agentName);
    setAgentRole(preset.agentRole);
    setCallPurpose(preset.callPurpose);
    setConversationGoal(preset.conversationGoal);
    setQualificationFields([...preset.qualification]);
    setPreCallVariables([...preset.preCall]);
    setBusinessKnowledge(preset.knowledge);
    setFaqs([...preset.faqs]);
    setActions([...preset.actions]);
  };

  // Add question field — keys must be unique and non-empty (a Hindi-only
  // label or punctuation would otherwise slug to "" and collide).
  const handleAddField = () => {
    if (!newFieldLabel.trim()) return;
    const generatedKey = (newFieldKey || newFieldLabel)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!generatedKey) return;
    if (qualificationFields.some((f) => f.key === generatedKey)) return;

    const choicesArray =
      newFieldType === "choice" && newFieldChoices.trim()
        ? newFieldChoices.split(",").map((c) => c.trim()).filter(Boolean)
        : undefined;

    setQualificationFields((prev) => [
      ...prev,
      {
        key: generatedKey,
        label: newFieldLabel.trim(),
        type: newFieldType,
        required: newFieldRequired,
        description: newFieldDesc.trim() || undefined,
        choices: choicesArray,
      },
    ]);

    setNewFieldLabel("");
    setNewFieldKey("");
    setNewFieldDesc("");
    setNewFieldChoices("");
  };

  const removeField = (key: string) => {
    setQualificationFields((prev) => prev.filter((f) => f.key !== key));
  };

  // Pre-call variables — same uniqueness rule as qualification fields.
  const handleAddPreCall = () => {
    if (!newPreKey.trim()) return;
    const cleanKey = newPreKey.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!cleanKey) return;
    if (preCallVariables.some((v) => v.key === cleanKey)) return;
    setPreCallVariables((prev) => [
      ...prev,
      {
        key: cleanKey,
        label: newPreLabel.trim() || cleanKey,
        source: "pre",
        value_type: "text",
      },
    ]);
    setNewPreKey("");
    setNewPreLabel("");
  };

  const removePreCall = (key: string) => {
    setPreCallVariables((prev) => prev.filter((v) => v.key !== key));
  };

  // FAQs
  const handleAddFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    setFaqs((prev) => [...prev, { question: newFaqQ.trim(), answer: newFaqA.trim() }]);
    setNewFaqQ("");
    setNewFaqA("");
  };

  const removeFaq = (idx: number) => {
    setFaqs((prev) => prev.filter((_, i) => i !== idx));
  };

  // Actions
  const toggleAction = (act: string) => {
    setActions((prev) => (prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]));
  };

  const handleAddCustomAction = () => {
    if (!newActionText.trim()) return;
    if (!actions.includes(newActionText.trim())) {
      setActions((prev) => [...prev, newActionText.trim()]);
    }
    setNewActionText("");
  };

  // Rules
  const handleAddRule = () => {
    if (!newRule.trim()) return;
    setRules((prev) => [...prev, newRule.trim()]);
    setNewRule("");
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  // Construct structured specification
  const currentSpecification: AgentSpecification = {
    call_type: callType,
    agent: {
      name: agentName,
      role: agentRole,
    },
    call_purpose: callPurpose,
    desired_outcomes: desiredOutcomes,
    qualification_fields: qualificationFields,
    pre_call_variables: preCallVariables,
    business_knowledge: businessKnowledge,
    faqs,
    actions: actions.map((a) => ({ action: a })),
    language: primaryLanguage,
    auto_language_switch: autoLanguageSwitch,
    personality: personalityTraits,
    conversation_style: conversationStyle,
    rules,
  };

  // Generate Agent Bundle (Calls /api/agents/generate)
  const handleGenerateBundle = async () => {
    setGeneratingBundle(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specification: currentSpecification }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate agent bundle");
      }

      const data = await res.json();
      setGeneratedBundle(data.bundle);
      setSystemPrompt(data.system_prompt);
      setCurrentStep(12); // Advance to preview
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error generating agent bundle");
    } finally {
      setGeneratingBundle(false);
    }
  };

  // Save agent (Draft or Publish)
  const handleSaveAgent = async (shouldPublish: boolean) => {
    if (!generatedBundle) return;
    setSavingAgent(true);
    setErrorMsg(null);

    try {
      const payload = {
        name: `${agentName} (${callType === "outbound" ? "Outbound" : "Inbound"})`,
        voiceId: selectedVoiceId,
        language: primaryLanguage,
        systemPrompt,
        introduction: generatedBundle.first_response,
        specification: currentSpecification,
        bundle: generatedBundle,
        status: shouldPublish ? "active" : "draft",
      };

      let agentId = savedAgentId;

      if (!agentId) {
        const createRes = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!createRes.ok) {
          const errData = await createRes.json();
          throw new Error(errData.error || "Failed to create agent record");
        }

        const createData = await createRes.json();
        agentId = createData.agent.id;
        setSavedAgentId(agentId);
      } else {
        const updateRes = await fetch(`/api/agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!updateRes.ok) {
          const errData = await updateRes.json();
          throw new Error(errData.error || "Failed to update agent");
        }
      }

      if (shouldPublish && agentId) {
        const publishRes = await fetch(`/api/agents/${agentId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changeSummary: "Initial Agent Wizard publication" }),
        });
        if (!publishRes.ok) {
          const errData = await publishRes.json();
          throw new Error(errData.error || "Failed to publish agent version");
        }
        setPublishSuccess(true);
        setIsTestCallOpen(true);
      } else {
        router.push("/agents");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving agent");
    } finally {
      setSavingAgent(false);
    }
  };

  const voiceChoices: VoiceChoice[] =
    voices.length > 0 ? voices : CARTESIA_VOICE_PRESETS;

  return (
    <div className="space-y-8">
      {/* Audio player hidden element */}
      <audio ref={audioPreviewRef} className="hidden" />

      {/* Stepper Header */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[750px] gap-2">
          {STEPS.map((s) => {
            const isCompleted = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => {
                  if (s.step < currentStep || generatedBundle) {
                    // Stepping back after Generate invalidates the bundle —
                    // saving afterwards must not publish stale content.
                    if (generatedBundle && s.step < 12) setGeneratedBundle(null);
                    setCurrentStep(s.step);
                  }
                }}
                disabled={s.step > currentStep && !generatedBundle}
                className={`flex items-center gap-2 text-left transition-all py-1 px-2 rounded-lg cursor-pointer ${
                  isCurrent
                    ? "text-violet-600 dark:text-violet-400 font-bold bg-violet-50 dark:bg-violet-950/40"
                    : isCompleted
                    ? "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                    : "text-stone-400 dark:text-stone-600 opacity-60 cursor-not-allowed"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isCurrent
                      ? "bg-violet-600 text-white shadow-xs"
                      : isCompleted
                      ? "bg-emerald-500 text-white"
                      : "bg-stone-200 dark:bg-stone-800 text-stone-500"
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : s.step}
                </div>
                <div className="hidden lg:block">
                  <div className="text-xs leading-none">{s.title}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Wizard Content Card */}
      <Card className="border-stone-200 dark:border-stone-800 shadow-sm bg-white dark:bg-stone-900">
        <CardHeader className="border-b border-stone-100 dark:border-stone-800/80 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                Step {currentStep} of 12
              </span>
              <CardTitle className="text-xl font-bold text-stone-900 dark:text-white mt-0.5">
                {STEPS[currentStep - 1].title}
              </CardTitle>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                {STEPS[currentStep - 1].desc}
              </p>
            </div>

            {currentStep === 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 font-medium hidden sm:inline">Use Template:</span>
                {INDUSTRY_PRESETS.map((p, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-dashed"
                    onClick={() => loadPreset(p)}
                  >
                    {p.title.split(" ")[0]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {errorMsg && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: Call Type */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  onClick={() => setCallType("outbound")}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    callType === "outbound"
                      ? "border-violet-600 bg-violet-50/50 dark:bg-violet-950/20 shadow-xs"
                      : "border-stone-200 dark:border-stone-800 hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-stone-900 dark:text-white text-base">
                      Outbound Calling Agent
                    </span>
                    <Badge variant={callType === "outbound" ? "default" : "secondary"}>
                      Proactive
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                    Agent dials target leads, introduces company & reason for calling, verifies contact availability, asks qualification questions, and books next steps.
                  </p>
                  <div className="mt-4 text-[11px] text-stone-500 font-medium">
                    Best for: Lead qualification, real estate follow-ups, renewal reminders.
                  </div>
                </div>

                <div
                  onClick={() => setCallType("inbound")}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    callType === "inbound"
                      ? "border-violet-600 bg-violet-50/50 dark:bg-violet-950/20 shadow-xs"
                      : "border-stone-200 dark:border-stone-800 hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-stone-900 dark:text-white text-base">
                      Inbound Reception & Support
                    </span>
                    <Badge variant={callType === "inbound" ? "default" : "secondary"}>
                      Reactive
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                    Agent answers incoming calls to your business number, warmly greets the caller, resolves inquiries using business knowledge, and captures requirements.
                  </p>
                  <div className="mt-4 text-[11px] text-stone-500 font-medium">
                    Best for: Front desk clinic reception, e-commerce support, hotel booking.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Agent Identity */}
          {currentStep === 2 && (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Agent Persona Name *
                </label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Priya, Alex, Rahul"
                  className="text-sm"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  The spoken name your AI agent introduces itself as.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Agent Professional Role *
                </label>
                <Input
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  placeholder="e.g. Senior Property Consultant, Patient Coordinator"
                  className="text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Company / Organization Name *
                </label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Greenfield Developers, Aesthetic Dental Care"
                  className="text-sm"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Call Purpose */}
          {currentStep === 3 && (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  What is the primary purpose of this call? *
                </label>
                <Textarea
                  value={callPurpose}
                  onChange={(e) => setCallPurpose(e.target.value)}
                  rows={3}
                  placeholder={
                    callType === "outbound"
                      ? "e.g. Qualify interest in 3BHK luxury villas in Jubilee Hills and invite for a site visit"
                      : "e.g. Assist patients with dental appointment booking, timings, and checkup pricing"
                  }
                  className="text-sm"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  This gives the agent its context and reason for engaging the caller.
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: Conversation Goal & Outcomes */}
          {currentStep === 4 && (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Primary Conversation Goal *
                </label>
                <Input
                  value={conversationGoal}
                  onChange={(e) => setConversationGoal(e.target.value)}
                  placeholder="e.g. Schedule an on-site visit for this weekend"
                  className="text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Specific Desired Outcomes
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {desiredOutcomes.map((out, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1 py-1 px-2.5">
                      {out}
                      <button
                        type="button"
                        onClick={() =>
                          setDesiredOutcomes(desiredOutcomes.filter((_, i) => i !== idx))
                        }
                        className="hover:text-red-500 ml-1"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={newOutcome}
                    onChange={(e) => setNewOutcome(e.target.value)}
                    placeholder="Add an outcome (e.g. Confirm budget capability)"
                    className="text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newOutcome.trim()) {
                          setDesiredOutcomes([...desiredOutcomes, newOutcome.trim()]);
                          setNewOutcome("");
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (newOutcome.trim()) {
                        setDesiredOutcomes([...desiredOutcomes, newOutcome.trim()]);
                        setNewOutcome("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Information to Ask / Qualify */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Voice Rule:</strong> The agent asks these questions <strong>one at a time</strong>. It acknowledges caller responses naturally before asking the next question.
                </span>
              </div>

              {/* Existing Fields List */}
              <div className="space-y-3">
                {qualificationFields.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between p-3.5 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 rounded-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-stone-900 dark:text-white">
                          {field.label}
                        </span>
                        <code className="text-[11px] font-mono text-violet-600 bg-violet-50 dark:bg-violet-950 px-1.5 py-0.5 rounded">
                          {"{" + field.key + "}"}
                        </code>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {field.type}
                        </Badge>
                        {field.required && (
                          <Badge variant="default" className="text-[10px] bg-red-600">
                            Required
                          </Badge>
                        )}
                      </div>
                      {field.description && (
                        <p className="text-[11px] text-stone-500 mt-1">
                          Question prompt: &quot;{field.description}&quot;
                        </p>
                      )}
                      {field.choices && field.choices.length > 0 && (
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          Options: {field.choices.join(" | ")}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeField(field.key)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add New Field Box */}
              <div className="border border-dashed border-stone-300 dark:border-stone-700 rounded-xl p-4 bg-stone-50/50 dark:bg-stone-900/50 space-y-3">
                <span className="text-xs font-semibold text-stone-900 dark:text-white flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-violet-600" />
                  Add Qualification Question
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-stone-600 dark:text-stone-400 block mb-1">
                      Field Label *
                    </label>
                    <Input
                      value={newFieldLabel}
                      onChange={(e) => {
                        setNewFieldLabel(e.target.value);
                        if (!newFieldKey) {
                          setNewFieldKey(
                            e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_")
                          );
                        }
                      }}
                      placeholder="e.g. Budget Range"
                      className="text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-stone-600 dark:text-stone-400 block mb-1">
                      Variable Key (snake_case)
                    </label>
                    <Input
                      value={newFieldKey}
                      onChange={(e) => setNewFieldKey(e.target.value)}
                      placeholder="budget_range"
                      className="text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-stone-600 dark:text-stone-400 block mb-1">
                      Answer Type
                    </label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as typeof newFieldType)}
                      className="w-full text-xs h-9 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2"
                    >
                      <option value="text">Freeform Text</option>
                      <option value="choice">Multiple Choice</option>
                      <option value="number">Number / Amount</option>
                      <option value="date">Date / Time</option>
                      <option value="boolean">Yes / No</option>
                    </select>
                  </div>
                </div>

                {newFieldType === "choice" && (
                  <div>
                    <label className="text-[11px] text-stone-600 dark:text-stone-400 block mb-1">
                      Choices (comma separated)
                    </label>
                    <Input
                      value={newFieldChoices}
                      onChange={(e) => setNewFieldChoices(e.target.value)}
                      placeholder="3 BHK, 4 BHK, Villa, Penthouse"
                      className="text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-stone-600 dark:text-stone-400 block mb-1">
                    Question Phrasing / Prompt Hint
                  </label>
                  <Input
                    value={newFieldDesc}
                    onChange={(e) => setNewFieldDesc(e.target.value)}
                    placeholder="e.g. What is your approximate budget for the property?"
                    className="text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldRequired}
                      onChange={(e) => setNewFieldRequired(e.target.checked)}
                      className="rounded border-stone-300 text-violet-600 focus:ring-violet-500"
                    />
                    Required field (agent must collect before closing)
                  </label>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddField}
                    disabled={!newFieldLabel.trim()}
                  >
                    Add Question
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Pre-call Known Information */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-800 dark:text-blue-300 text-xs flex items-center gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  <strong>Strict Rule:</strong> The agent will <strong>NEVER ask callers</strong> for information that is already provided here. For example, if <code>lead_name</code> is present, it will address them directly.
                </span>
              </div>

              <div className="space-y-3">
                {preCallVariables.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-center justify-between p-3.5 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-violet-600 bg-violet-50 dark:bg-violet-950 px-2 py-0.5 rounded">
                        {"{" + v.key + "}"}
                      </code>
                      <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                        {v.label}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePreCall(v.key)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 items-end max-w-xl">
                <div className="flex-1">
                  <label className="text-[11px] text-stone-600 block mb-1">Variable Key</label>
                  <Input
                    value={newPreKey}
                    onChange={(e) => setNewPreKey(e.target.value)}
                    placeholder="e.g. account_id"
                    className="text-xs font-mono"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-stone-600 block mb-1">Display Label</label>
                  <Input
                    value={newPreLabel}
                    onChange={(e) => setNewPreLabel(e.target.value)}
                    placeholder="Customer Account ID"
                    className="text-xs"
                  />
                </div>
                <Button type="button" size="sm" onClick={handleAddPreCall} disabled={!newPreKey.trim()}>
                  Add Variable
                </Button>
              </div>
            </div>
          )}

          {/* STEP 7: Business Knowledge & FAQs */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Verified Business Knowledge & Offerings *
                </label>
                <Textarea
                  value={businessKnowledge}
                  onChange={(e) => setBusinessKnowledge(e.target.value)}
                  rows={4}
                  placeholder="Paste verified facts: project location, pricing benchmarks, specifications, amenities, or doctor consultation fees..."
                  className="text-xs"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  The agent uses this knowledge to accurately answer customer inquiries without hallucinating.
                </p>
              </div>

              <div className="border-t border-stone-200 dark:border-stone-800 pt-4 space-y-4">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Common FAQs (Question & Answer Pairs)
                </label>

                <div className="space-y-3">
                  {faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 rounded-lg flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1 text-xs">
                        <div className="font-semibold text-stone-900 dark:text-white">
                          Q: {faq.question}
                        </div>
                        <div className="text-stone-600 dark:text-stone-400">
                          A: {faq.answer}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFaq(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="border border-dashed border-stone-300 dark:border-stone-700 rounded-xl p-3.5 bg-stone-50/50 dark:bg-stone-900/50 space-y-2">
                  <Input
                    value={newFaqQ}
                    onChange={(e) => setNewFaqQ(e.target.value)}
                    placeholder="Question (e.g. When is possession?)"
                    className="text-xs"
                  />
                  <Textarea
                    value={newFaqA}
                    onChange={(e) => setNewFaqA(e.target.value)}
                    placeholder="Answer (e.g. Possession starts in December 2026)"
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddFaq}
                      disabled={!newFaqQ.trim() || !newFaqA.trim()}
                    >
                      Add FAQ
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 8: Actions / Next Steps */}
          {currentStep === 8 && (
            <div className="space-y-6 max-w-xl">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                What actions can the agent execute once conversation goals are achieved?
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Schedule site visit",
                  "Send WhatsApp brochure",
                  "Transfer call to human specialist",
                  "Send SMS confirmation",
                  "Book calendar appointment slot",
                  "Log qualified lead into CRM",
                ].map((act) => {
                  const isChecked = actions.includes(act);
                  return (
                    <div
                      key={act}
                      onClick={() => toggleAction(act)}
                      className={`p-3 border rounded-xl cursor-pointer text-xs font-medium flex items-center justify-between transition-all ${
                        isChecked
                          ? "border-violet-600 bg-violet-50/60 dark:bg-violet-950/30 text-violet-900 dark:text-violet-200 shadow-xs"
                          : "border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300"
                      }`}
                    >
                      <span>{act}</span>
                      {isChecked && <Check className="w-4 h-4 text-violet-600" />}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <Input
                  value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  placeholder="Add custom action (e.g. Email property pricing sheet)"
                  className="text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomAction();
                    }
                  }}
                />
                <Button type="button" size="sm" onClick={handleAddCustomAction}>
                  Add Action
                </Button>
              </div>
            </div>
          )}

          {/* STEP 9: Language & Voice */}
          {currentStep === 9 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Primary Spoken Language *
                  </label>
                  <select
                    value={primaryLanguage}
                    onChange={(e) => setPrimaryLanguage(e.target.value)}
                    className="w-full text-xs h-9 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3"
                  >
                    {INDIAN_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Secondary Languages (Supported for Multilingual callers)
                  </label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {INDIAN_LANGUAGES.filter((l) => l.code !== primaryLanguage).map((l) => {
                      const isSelected = secondaryLanguages.includes(l.code);
                      return (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => {
                            setSecondaryLanguages((prev) =>
                              prev.includes(l.code)
                                ? prev.filter((c) => c !== l.code)
                                : [...prev, l.code]
                            );
                          }}
                          className={`text-[11px] py-1 px-2.5 rounded-full border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-violet-600 text-white border-violet-600"
                              : "border-stone-200 dark:border-stone-800 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-stone-900 dark:text-white block">
                    Automatic Language Switching
                  </span>
                  <span className="text-[11px] text-stone-500">
                    If caller speaks in Hindi, Telugu, or English, agent automatically adapts without asking.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoLanguageSwitch}
                  onChange={(e) => setAutoLanguageSwitch(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-violet-600"
                />
              </div>

              {/* Voice Picker */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
                  Select Cartesia Voice Persona (with Audio Preview)
                </label>

                {loadingVoices ? (
                  <div className="p-6 text-center text-xs text-stone-500">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                    Loading voices...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                    {voiceChoices.map((v) => {
                      const isSelected = selectedVoiceId === v.id;
                      const isPlaying = playingVoiceId === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVoiceId(v.id)}
                          className={`p-3 border rounded-xl cursor-pointer flex items-center justify-between transition-all ${
                            isSelected
                              ? "border-violet-600 bg-violet-50/50 dark:bg-violet-950/20 shadow-xs"
                              : "border-stone-200 dark:border-stone-800 hover:border-stone-300"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <span className="text-xs font-semibold text-stone-900 dark:text-white block">
                              {v.name}
                            </span>
                            <span className="text-[10px] text-stone-500 capitalize">
                              {v.gender} • {v.accent || "Standard"}
                            </span>
                          </div>

                          {v.preview_url && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayPreview(v.id, v.preview_url!);
                              }}
                            >
                              {isPlaying ? (
                                <Square className="h-3 w-3 text-red-500 fill-red-500" />
                              ) : (
                                <Play className="h-3 w-3 text-violet-600 fill-violet-600" />
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 10: Behavior & Restrictions */}
          {currentStep === 10 && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
                  Conversation Delivery Style
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: "concise", title: "Concise", desc: "Short, direct, 1 quick sentence per turn" },
                    { key: "balanced", title: "Balanced", desc: "Professional, polite, natural conversational flow" },
                    { key: "conversational", title: "Conversational", desc: "Warm, empathetic, consultative cadence" },
                  ] as const).map((style) => (
                    <div
                      key={style.key}
                      onClick={() => setConversationStyle(style.key)}
                      className={`p-3.5 border rounded-xl cursor-pointer text-center transition-all ${
                        conversationStyle === style.key
                          ? "border-violet-600 bg-violet-50/50 dark:bg-violet-950/20 shadow-xs"
                          : "border-stone-200 dark:border-stone-800 hover:border-stone-300"
                      }`}
                    >
                      <span className="text-xs font-bold text-stone-900 dark:text-white block">
                        {style.title}
                      </span>
                      <span className="text-[10px] text-stone-500 mt-1 block">
                        {style.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rules Checklist */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
                  Behavior & Guardrail Rules
                </label>
                <div className="space-y-2 mb-3">
                  {rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <span className="text-stone-800 dark:text-stone-200">{rule}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRule(idx)}
                        className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={newRule}
                    onChange={(e) => setNewRule(e.target.value)}
                    placeholder="Add custom rule (e.g. Always thank caller before disconnecting)"
                    className="text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddRule();
                      }
                    }}
                  />
                  <Button type="button" size="sm" onClick={handleAddRule}>
                    Add Rule
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 11: Review Specification & Generate */}
          {currentStep === 11 && (
            <div className="space-y-6">
              <div className="p-4 bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800 rounded-xl space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-3 border-b border-stone-200 dark:border-stone-700">
                  <div>
                    <span className="text-stone-500 text-[11px] block">Call Type</span>
                    <span className="font-bold capitalize text-stone-900 dark:text-white">
                      {callType}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 text-[11px] block">Agent Persona</span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {agentName} ({agentRole})
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 text-[11px] block">Company</span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {companyName}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 text-[11px] block">Language</span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {primaryLanguage} {secondaryLanguages.length ? `(+${secondaryLanguages.join(",")})` : ""}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-stone-500 text-[11px] block mb-1">Primary Goal</span>
                  <span className="font-medium text-stone-800 dark:text-stone-200">
                    {conversationGoal}
                  </span>
                </div>

                <div>
                  <span className="text-stone-500 text-[11px] block mb-1">
                    Questions to Qualify ({qualificationFields.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {qualificationFields.map((q) => (
                      <Badge key={q.key} variant="secondary" className="text-[11px]">
                        {q.label} ({q.type})
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-stone-500 text-[11px] block mb-1">
                    Pre-known Customer Information ({preCallVariables.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {preCallVariables.map((v) => (
                      <Badge key={v.key} variant="outline" className="text-[11px] font-mono">
                        {"{" + v.key + "}"}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-stone-500 text-[11px] block mb-1">
                    Configured FAQs & Knowledge
                  </span>
                  <span className="text-stone-700 dark:text-stone-300">
                    {faqs.length} FAQs configured • {businessKnowledge.length} chars verified knowledge
                  </span>
                </div>
              </div>

              <div className="text-center py-4 space-y-3">
                <Button
                  type="button"
                  size="lg"
                  className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-8 shadow-md gap-2"
                  onClick={handleGenerateBundle}
                  disabled={generatingBundle}
                >
                  {generatingBundle ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Generating Production Agent Bundle...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 text-amber-300" />
                      Generate Production Agent Bundle
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-stone-500">
                  Transforms your answers into an optimized, schema-validated JSON bundle ready for real-time voice calls.
                </p>
              </div>
            </div>
          )}

          {/* STEP 12: Agent Bundle Preview UI */}
          {currentStep === 12 && generatedBundle && (
            <div className="space-y-6">
              {publishSuccess && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <strong className="text-sm">Agent Published Successfully!</strong>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Your agent is active and ready to make/receive calls.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => router.push("/agents")}
                  >
                    View in Agent Hub
                  </Button>
                </div>
              )}

              {/* First Response Spoken Utterance */}
              <div className="p-4 bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 text-violet-600" />
                    Opening Utterance (Spoken First)
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {callType === "outbound" ? "Lead Greeter" : "Inbound Welcome"}
                  </Badge>
                </div>
                <p className="text-sm italic font-medium text-violet-950 dark:text-violet-100 pl-2 border-l-2 border-violet-500">
                  &quot;{generatedBundle.first_response}&quot;
                </p>
              </div>

              {/* Conversation Flow Diagram / Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                    <Workflow className="h-4 w-4 text-violet-600" />
                    Conversation Sections Flowchart (Schema v2)
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {generatedBundle.sections.length} Logical States
                  </span>
                </div>

                <div className="space-y-3">
                  {generatedBundle.sections.map((section, idx) => (
                    <div
                      key={section.section_key}
                      className="border border-stone-200 dark:border-stone-800 rounded-xl p-4 bg-stone-50/60 dark:bg-stone-800/40 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-stone-900 dark:text-white">
                            {section.label}
                          </span>
                          <code className="text-[10px] font-mono text-violet-600 bg-violet-50 dark:bg-violet-950 px-1 rounded">
                            {section.section_key}
                          </code>
                        </div>

                        {section.edges && section.edges.length > 0 ? (
                          <div className="text-[11px] text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1">
                            <span>Transitions to:</span>
                            {section.edges.map((e) => (
                              <code
                                key={e.to_key}
                                className="bg-white dark:bg-stone-900 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700"
                              >
                                {e.to_key}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-stone-500">
                            Terminal State (Disconnect)
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-stone-600 dark:text-stone-300 whitespace-pre-line bg-white dark:bg-stone-900 p-2.5 rounded-lg border border-stone-200 dark:border-stone-800">
                        {section.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Variables Table */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-violet-600" />
                  Variables Matrix
                </span>

                <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-stone-100 dark:bg-stone-800/70 text-stone-600 dark:text-stone-400 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Variable Key</th>
                        <th className="py-2 px-3">Display Label</th>
                        <th className="py-2 px-3">Source</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Required</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 dark:divide-stone-800 bg-white dark:bg-stone-900">
                      {generatedBundle.variables.map((v) => (
                        <tr key={v.key}>
                          <td className="py-2 px-3 font-mono text-violet-600">
                            {"{" + v.key + "}"}
                          </td>
                          <td className="py-2 px-3">{v.label}</td>
                          <td className="py-2 px-3">
                            <Badge
                              variant="outline"
                              className={
                                v.source === "pre"
                                  ? "border-blue-300 text-blue-700"
                                  : "border-amber-300 text-amber-700"
                              }
                            >
                              {v.source === "pre" ? "Pre-call Known" : "Collected Live"}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 capitalize">{v.value_type}</td>
                          <td className="py-2 px-3">
                            {v.required ? (
                              <span className="text-red-500 font-bold">Yes</span>
                            ) : (
                              <span className="text-stone-400">Optional</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* JSON Toggle */}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="text-xs gap-1.5"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  {showRawJson ? "Hide Raw JSON Bundle" : "Inspect Raw JSON Bundle v2"}
                </Button>

                {showRawJson && (
                  <pre className="mt-2 p-4 bg-stone-950 text-stone-200 rounded-xl text-xs font-mono overflow-x-auto max-h-96">
                    {JSON.stringify(generatedBundle, null, 2)}
                  </pre>
                )}
              </div>

              {publishSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/60 dark:bg-emerald-950/40 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300">
                      <Rocket className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                        Voice Agent Successfully Saved & Published!
                      </h4>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        Your agent is active in MongoDB and ready for phone calls via Plivo.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsTestCallOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Place Test Call Now
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/agents")}
                      className="text-xs"
                    >
                      All Agents
                    </Button>
                  </div>
                </div>
              )}

              {/* Final Control Buttons Bar */}
              <div className="border-t border-stone-200 dark:border-stone-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentStep(11)}
                    className="text-xs"
                  >
                    ← Edit Answers
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateBundle}
                    disabled={generatingBundle}
                    className="text-xs gap-1"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${generatingBundle ? "animate-spin" : ""}`} />
                    Regenerate Bundle
                  </Button>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  {savedAgentId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTestCallOpen(true)}
                      className="text-xs text-violet-600 gap-1 border-violet-200"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Test Call
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSaveAgent(false)}
                    disabled={savingAgent}
                    className="text-xs gap-1"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSaveAgent(true)}
                    disabled={savingAgent}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    {savingAgent ? "Publishing..." : "Save & Publish Agent"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Stepper Navigation (Steps 1 - 11) */}
          {currentStep < 12 && (
            <div className="border-t border-stone-200 dark:border-stone-800 mt-8 pt-4 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                disabled={currentStep === 1}
                className="gap-1 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Previous
              </Button>

              {currentStep < 11 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCurrentStep((prev) => Math.min(11, prev + 1))}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-1 text-xs font-semibold"
                >
                  Next Step
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleGenerateBundle}
                  disabled={generatingBundle}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-1 text-xs font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  Generate Agent Bundle
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Call Dialog */}
      {isTestCallOpen && savedAgentId && (
        <TestCallDialog
          isOpen={isTestCallOpen}
          onClose={() => setIsTestCallOpen(false)}
          defaultAgentId={savedAgentId}
        />
      )}
    </div>
  );
}
