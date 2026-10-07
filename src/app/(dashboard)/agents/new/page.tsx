"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Bot,
  Volume2,
  FileText,
  GitFork,
  Zap,
  Play,
  Pause,
  Sparkles,
  Phone,
  ShieldAlert,
  Send,
  MessageSquare,
  Mic,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createAgent } from "@/lib/api/agents";

const STEPS = [
  { id: 1, title: "Basics" },
  { id: 2, title: "Voice" },
  { id: 3, title: "Instructions" },
  { id: 4, title: "Call Flow" },
  { id: 5, title: "Actions" },
  { id: 6, title: "Test" },
  { id: 7, title: "Publish" },
];

export default function CreateAgentPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "Insurance Lead Quality Checker",
    description: "Qualifies health and motor insurance leads in natural Telugu, verifies policy renewal dates and budgets.",
    industry: "Insurance",
    useCase: "Policy renewal discount outreach & inbound advisor routing",
    language: "Telugu",
    languageCode: "te-IN",
    voiceName: "Sonic 3.6 Telugu Warm",
    voiceId: "sonic-te-in-ravi-v1",
    speed: 1.0,
    stability: 0.8,
    pitch: 0.0,
    phoneNumber: "+91 80 4719 3320",
    objective: "Confirm lead identity, verify active insurance expiry within 30 days, check budget, and route qualified prospects to senior underwriters.",
    personality: "Polite, professional, reassuring, conversational South Indian Telugu business tone.",
    openingMessage: "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా? నేను యాక్మే ఇన్సూరెన్స్ నుండి రవిని మాట్లాడుతున్నాను.",
    instructions: "1. Confirm lead identity immediately with warmth.\n2. Inquire if they currently hold active insurance for their vehicle or family.\n3. Ascertain renewal timeline within 30 days.\n4. Check approximate budget and claim history.\n5. If interested, confirm callback time; otherwise politely conclude.",
    qualificationCriteria: "Lead owns a vehicle or needs health coverage, policy expires within 45 days, open to receiving a competitive quote.",
    forbiddenRules: "Never quote binding premium numbers without underwriter calculation. Never harass customer. Do not ask for OTP, passwords, or bank PINs.",
    actions: {
      transferCall: true,
      transferNumber: "+91 80 4719 3399",
      sendSms: true,
      smsTemplate: "Dear {{lead_name}}, thank you for speaking with Acme Insurance. Our advisor will reach you shortly.",
      webhookUrl: "https://api.acmeinsurance.in/v1/leads/webhook",
      createCrmLead: true,
      updateCrm: true,
      scheduleCallback: true,
    },
  });

  // Simulated browser test console state
  const [testCallStatus, setTestCallStatus] = useState<"idle" | "calling" | "connected">("idle");
  const [testTranscript, setTestTranscript] = useState<Array<{ speaker: string; text: string }>>([]);

  const handleNext = () => {
    if (currentStep < 7) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleStartTestCall = () => {
    setTestCallStatus("calling");
    setTestTranscript([]);
    setTimeout(() => {
      setTestCallStatus("connected");
      setTestTranscript([
        { speaker: "Agent", text: formData.openingMessage.replace("{{lead_name}}", "Praveen") },
      ]);
    }, 1200);
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      await createAgent({
        name: formData.name,
        role: `${formData.industry} Specialist`,
        description: formData.description,
        industry: formData.industry as any,
        useCase: formData.useCase,
        language: formData.language,
        languageCode: formData.languageCode,
        voiceName: formData.voiceName,
        voiceId: formData.voiceId,
        speed: formData.speed,
        stability: formData.stability,
        pitch: formData.pitch,
        phoneNumber: formData.phoneNumber,
        objective: formData.objective,
        personality: formData.personality,
        openingMessage: formData.openingMessage,
        instructions: formData.instructions,
        qualificationCriteria: formData.qualificationCriteria,
        forbiddenRules: formData.forbiddenRules,
        actions: formData.actions,
        status: "ready",
      });
      router.push("/agents");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/agents"
            className="p-1.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Create AI agent
            </h1>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Configure voice parameters, instructions, conversation flow, and integrations.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Steps Indicator */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between overflow-x-auto gap-2">
          {STEPS.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;

            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors ${
                  isCurrent
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 font-semibold"
                    : isCompleted
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-gray-400 dark:text-neutral-500 hover:text-gray-700"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                    isCurrent
                      ? "bg-blue-600 text-white"
                      : isCompleted
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 dark:bg-neutral-800 text-gray-500"
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : step.id}
                </div>
                <span>{step.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: BASICS */}
      {currentStep === 1 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">1. Agent Basics</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Set the agent identity, target industry, and core use case.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Agent Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. Insurance Lead Quality Checker"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="What does this voice agent do?"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  Industry *
                </label>
                <select
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Insurance">Insurance</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Education">Education</option>
                  <option value="Loans">Loans & Credit</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Other">Other SMB</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  Primary Use Case
                </label>
                <input
                  type="text"
                  value={formData.useCase}
                  onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Lead Qualification / Inbound Inquiries"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: VOICE */}
      {currentStep === 2 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">2. Voice & Telephony</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Select Indian regional language, ultra-low latency Cartesia voice model, and assigned number.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  Language *
                </label>
                <select
                  value={formData.language}
                  onChange={(e) => {
                    const l = e.target.value;
                    const code = l === "Telugu" ? "te-IN" : l === "Hindi" ? "hi-IN" : l === "Tamil" ? "ta-IN" : "en-IN";
                    setFormData({ ...formData, language: l, languageCode: code });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Telugu">Telugu (తెలుగు)</option>
                  <option value="Hindi">Hindi (हिन्दी)</option>
                  <option value="English">Indian English</option>
                  <option value="Tamil">Tamil (தமிழ்)</option>
                  <option value="Hinglish">Hinglish</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  TTS Voice Provider
                </label>
                <input
                  type="text"
                  readOnly
                  value="Cartesia Sonic 3.6 (Direct LiveKit Plugin)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Voice Model Selector & Audio Preview */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-850/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formData.voiceName}
                </div>
                <div className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                  Natural South Asian intonation · 90ms synthesis latency
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                className="gap-2 shrink-0"
              >
                {isPlayingAudio ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-blue-600" />
                    <span>Stop Preview</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-blue-600" />
                    <span>Play Sample Voice</span>
                  </>
                )}
              </Button>
            </div>

            {/* Speed & Stability Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
                  <span>Speech Speed</span>
                  <span className="font-mono">{formData.speed}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.05"
                  value={formData.speed}
                  onChange={(e) => setFormData({ ...formData, speed: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
                  <span>Voice Stability</span>
                  <span className="font-mono">{Math.round(formData.stability * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={formData.stability}
                  onChange={(e) => setFormData({ ...formData, stability: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Phone Number Binding */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Assigned Phone Number (Caller ID)
              </label>
              <select
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              >
                <option value="+91 80 4719 3320">+91 80 4719 3320 (Bangalore — Active)</option>
                <option value="+91 40 4912 8840">+91 40 4912 8840 (Hyderabad — Active)</option>
                <option value="+91 22 5064 1190">+91 22 5064 1190 (Mumbai — Active)</option>
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: INSTRUCTIONS */}
      {currentStep === 3 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">3. Prompt Instructions & Guardrails</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Define the AI agent objective, opening message, qualification rubric, and strict boundaries.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Opening Message (Spoken word-for-word immediately on pickup) *
              </label>
              <textarea
                rows={2}
                value={formData.openingMessage}
                onChange={(e) => setFormData({ ...formData, openingMessage: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                placeholder="Opening line..."
              />
              <span className="text-[11px] text-gray-400">
                Variables like <code>&#123;&#123;lead_name&#125;&#125;</code>, <code>&#123;&#123;phone&#125;&#125;</code> will be injected automatically.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Agent Objective & Core Goal *
              </label>
              <textarea
                rows={2}
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Conversation Instructions (Step-by-step guidance)
              </label>
              <textarea
                rows={4}
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                  Qualification Criteria
                </label>
                <textarea
                  rows={3}
                  value={formData.qualificationCriteria}
                  onChange={(e) => setFormData({ ...formData, qualificationCriteria: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                  Things the agent must NEVER do (Guardrails)
                </label>
                <textarea
                  rows={3}
                  value={formData.forbiddenRules}
                  onChange={(e) => setFormData({ ...formData, forbiddenRules: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/30 dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: CALL FLOW */}
      {currentStep === 4 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">4. Visual Call Flow Graph</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Interactive node graph defining how the conversation branches and terminates.
            </p>
          </CardHeader>
          <CardContent>
            {/* Visual Flow diagram container */}
            <div className="bg-gray-50/70 dark:bg-neutral-950 p-6 rounded-xl border border-gray-200 dark:border-neutral-800 flex flex-col items-center gap-3">
              {/* Start Node */}
              <div className="px-4 py-2 rounded-full bg-blue-600 text-white font-semibold text-xs shadow-xs">
                ▶ Start Call
              </div>
              <div className="w-0.5 h-6 bg-gray-300 dark:bg-neutral-700" />

              {/* Greeting Node */}
              <div className="w-full max-w-md p-3.5 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shadow-2xs text-center">
                <div className="text-xs font-semibold text-gray-900 dark:text-white">
                  1. Greeting & Identity Verification
                </div>
                <div className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5">
                  Confirm customer name and introduction in {formData.language}
                </div>
              </div>
              <div className="w-0.5 h-6 bg-gray-300 dark:bg-neutral-700" />

              {/* Requirement Check Node */}
              <div className="w-full max-w-md p-3.5 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shadow-2xs text-center">
                <div className="text-xs font-semibold text-gray-900 dark:text-white">
                  2. Understand Requirement & Discovery
                </div>
                <div className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5">
                  Inquire policy expiration date and budget constraints
                </div>
              </div>
              <div className="w-0.5 h-6 bg-gray-300 dark:bg-neutral-700" />

              {/* Decision Diamond */}
              <div className="px-5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold">
                ◆ Qualified Lead?
              </div>

              {/* Split Branches */}
              <div className="w-full max-w-lg grid grid-cols-2 gap-4 mt-2">
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
                    ✓ Yes (Meets criteria)
                  </span>
                  <div className="w-full p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    Live Human Transfer or Book Callback
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 mb-2">
                    ✗ No (Not interested)
                  </span>
                  <div className="w-full p-3 bg-gray-100 dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 text-center text-xs font-medium text-gray-700 dark:text-neutral-300">
                    Polite Close & Log Disposition
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: ACTIONS */}
      {currentStep === 5 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">5. Automated Post-Call Actions</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Trigger instant SMS, CRM sync, or live human call transfers upon qualification.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Action Item: Live Human Transfer */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    Transfer call to human closer
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">
                    Warm transfer live caller if they ask for an agent or meet high-ticket qualification
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.actions.transferCall}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      actions: { ...formData.actions, transferCall: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {formData.actions.transferCall && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    Destination Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.actions.transferNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        actions: { ...formData.actions, transferNumber: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Action Item: SMS Notification */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    Send Follow-up SMS
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">
                    Immediately text quote link or advisor confirmation via Plivo trunk
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.actions.sendSms}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      actions: { ...formData.actions, sendSms: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {formData.actions.sendSms && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    SMS Template Text
                  </label>
                  <textarea
                    rows={2}
                    value={formData.actions.smsTemplate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        actions: { ...formData.actions, smsTemplate: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Action Item: Webhook Sync */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    CRM Webhook Integration
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">
                    POST call payload, recording URL, and qualification score to external CRM
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(formData.actions.webhookUrl)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      actions: {
                        ...formData.actions,
                        webhookUrl: e.target.checked
                          ? "https://api.acmeinsurance.in/v1/leads/webhook"
                          : "",
                      },
                    })
                  }
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {Boolean(formData.actions.webhookUrl) && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    value={formData.actions.webhookUrl}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        actions: { ...formData.actions, webhookUrl: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 font-mono"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 6: TEST */}
      {currentStep === 6 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">6. Interactive Voice Simulator</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Test conversation flow, voice naturalness, and latency in the browser.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-6 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-950 flex flex-col items-center justify-center text-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all ${
                  testCallStatus === "connected"
                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 ring-8 ring-emerald-500/10"
                    : "bg-blue-100 dark:bg-blue-950 text-blue-600"
                }`}
              >
                <Mic className="w-7 h-7" />
              </div>

              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {testCallStatus === "idle" && "Ready to test in browser"}
                {testCallStatus === "calling" && "Connecting to LiveKit runtime..."}
                {testCallStatus === "connected" && "● Connected (Live Audio)"}
              </div>

              <div className="text-xs text-gray-500 dark:text-neutral-400 mt-1 max-w-sm mb-4">
                Simulate a conversation using your microphone or inspect the agent's synthesized opening.
              </div>

              <div className="flex items-center gap-2">
                {testCallStatus === "idle" ? (
                  <Button variant="primary" size="sm" onClick={handleStartTestCall} className="gap-2">
                    <Play className="w-3.5 h-3.5" />
                    <span>Call agent</span>
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setTestCallStatus("idle")}
                    className="gap-2"
                  >
                    <span>End test</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Live Transcript Display */}
            {testTranscript.length > 0 && (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Live Transcript
                </div>
                {testTranscript.map((line, idx) => (
                  <div key={idx} className="text-xs leading-relaxed">
                    <span className="font-semibold text-blue-600">{line.speaker}: </span>
                    <span className="text-gray-800 dark:text-neutral-200">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 7: PUBLISH */}
      {currentStep === 7 && (
        <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold">7. Review & Publish</CardTitle>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Confirm agent specifications before deploying to live telephony workers.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400">Agent Name:</span>
                  <div className="font-semibold text-gray-900 dark:text-white mt-0.5">
                    {formData.name}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Industry:</span>
                  <div className="font-semibold text-gray-900 dark:text-white mt-0.5">
                    {formData.industry}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Language:</span>
                  <div className="font-semibold text-gray-900 dark:text-white mt-0.5">
                    {formData.language} ({formData.languageCode})
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Assigned Number:</span>
                  <div className="font-mono font-semibold text-gray-900 dark:text-white mt-0.5">
                    {formData.phoneNumber}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 dark:border-neutral-800 text-xs text-gray-600 dark:text-neutral-300">
              <span className="font-semibold text-gray-900 dark:text-white block mb-1">
                Opening Message:
              </span>
              <p className="font-mono bg-gray-50 dark:bg-neutral-800 p-2.5 rounded-lg text-gray-800 dark:text-neutral-200">
                "{formData.openingMessage}"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-neutral-800">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrev}
          disabled={currentStep === 1 || isSubmitting}
        >
          Previous
        </Button>

        <div className="flex items-center gap-2.5">
          {currentStep < 7 ? (
            <Button variant="primary" size="sm" onClick={handleNext} className="gap-1.5">
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={isSubmitting}
              className="gap-2 min-w-32"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Publish agent</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
