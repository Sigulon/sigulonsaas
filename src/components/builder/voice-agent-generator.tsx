"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import {
  ArrowLeft, ArrowRight, Bot, Check, ChevronDown, CircleHelp, Loader2,
  MessageSquareText, PhoneCall, Plus, RefreshCw, Rocket, Sparkles, Trash2,
} from "lucide-react";

type Mode = "inbound" | "outbound" | "bulk";

interface BundleVariable {
  key: string;
  label: string;
  source: "pre" | "capture";
  required: boolean;
  value_type: string;
}

interface BundleSection {
  section_key: string;
  label: string;
  prompt: string;
  edges: Array<{ to_key: string; condition: string }> | null;
}

interface Bundle {
  bundle_version: 2;
  exported_from: { employee_name: string; employee_role: string; mode: Mode; language: string };
  first_response: string;
  variables: BundleVariable[];
  sections: BundleSection[];
}

const LANGUAGES = [
  ["en-IN", "English"], ["hi-IN", "Hindi"], ["te-IN", "Telugu"], ["ta-IN", "Tamil"],
  ["kn-IN", "Kannada"], ["ml-IN", "Malayalam"], ["mr-IN", "Marathi"], ["bn-IN", "Bengali"],
  ["gu-IN", "Gujarati"], ["pa-IN", "Punjabi"], ["od-IN", "Odia"], ["as-IN", "Assamese"],
] as const;

const MODE_OPTIONS: Array<{ mode: Mode; title: string; description: string }> = [
  { mode: "inbound", title: "Inbound", description: "Customers call your business" },
  { mode: "outbound", title: "Outbound", description: "Your agent calls a customer or lead" },
  { mode: "bulk", title: "Bulk outbound", description: "Call a list of leads automatically" },
];

function languageName(code: string) {
  return LANGUAGES.find(([value]) => value === code)?.[1] || code;
}

export function VoiceAgentGenerator() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>("outbound");
  const [language, setLanguage] = useState("en-IN");
  const [secondaryLanguage, setSecondaryLanguage] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [agentGoal, setAgentGoal] = useState("");
  const [dataFields, setDataFields] = useState<string[]>([]);
  const [fieldDraft, setFieldDraft] = useState("");
  const [businessKnowledge, setBusinessKnowledge] = useState("");
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>([]);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationInstruction, setRegenerationInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAgentId, setSavedAgentId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const canAdvance = useMemo(() => {
    if (step === 3) return Boolean(businessDescription.trim());
    if (step === 4) return Boolean(agentGoal.trim());
    return true;
  }, [businessDescription, agentGoal, step]);

  const addField = () => {
    const next = fieldDraft.trim();
    if (next && !dataFields.some((field) => field.toLowerCase() === next.toLowerCase())) setDataFields((current) => [...current, next]);
    setFieldDraft("");
  };

  const addFaq = () => {
    if (faqQuestion.trim() && faqAnswer.trim()) setFaqs((current) => [...current, { question: faqQuestion.trim(), answer: faqAnswer.trim() }]);
    setFaqQuestion("");
    setFaqAnswer("");
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          language,
          languages: secondaryLanguage ? [language, secondaryLanguage] : [language],
          business_description: businessDescription,
          agent_goal: agentGoal,
          data_to_collect: dataFields,
          business_knowledge: businessKnowledge,
          faqs,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not generate the voice agent.");
      setBundle(payload.agent || payload.bundle);
      setSystemPrompt(payload.system_prompt || "");
      setStep(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the voice agent.");
    } finally {
      setGenerating(false);
    }
  };

  const regenerate = async () => {
    if (!bundle) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: bundle, instruction: regenerationInstruction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not regenerate the agent.");
      setBundle(payload.agent || payload.bundle);
      setRegenerationInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate the agent.");
    } finally {
      setRegenerating(false);
    }
  };

  const updateSection = (sectionKey: string, prompt: string) => {
    setBundle((current) => current && ({ ...current, sections: current.sections.map((section) => section.section_key === sectionKey ? { ...section, prompt } : section) }));
  };

  const save = async (publish: boolean) => {
    if (!bundle) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${bundle.exported_from.employee_role} (${mode === "bulk" ? "Bulk outbound" : mode})`,
          voiceId: CARTESIA_VOICE_PRESETS[0].id,
          language: bundle.exported_from.language,
          systemPrompt,
          introduction: bundle.first_response,
          specification: { mode, language, business_description: businessDescription, agent_goal: agentGoal, data_to_collect: dataFields, business_knowledge: businessKnowledge, faqs },
          bundle,
          status: "draft",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the voice agent.");
      const agentId = payload.agent.id as string;
      setSavedAgentId(agentId);
      if (publish) {
        const publishResponse = await fetch(`/api/agents/${agentId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeSummary: "Published from Voice Agent Generator" }) });
        const publishPayload = await publishResponse.json();
        if (!publishResponse.ok) throw new Error(publishPayload.error || "The agent was saved but could not be published.");
      }
      if (publish) setTestOpen(true);
      else router.push("/agents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the voice agent.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-[20px] bg-[#1E1433] p-6 text-white">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-content-center rounded-full bg-violet-600 text-white"><Sparkles className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-bold">Create a voice agent in plain language</h2>
            <p className="mt-1 max-w-2xl text-sm text-violet-100/80">Tell us about your business and the call outcome. We design the voice flow, data fields, prompts, safeguards, and fallback behaviour for you.</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {["Call type", "Language", "Business", "Call goal", "Knowledge", "Preview"].map((label, index) => <div key={label} className={`rounded-lg px-2 py-2 text-center text-[11px] font-medium ${step === index + 1 ? "bg-violet-600 text-white" : step > index + 1 ? "bg-white/15 text-violet-100" : "bg-white/10 text-violet-100/60"}`}>{step > index + 1 ? <Check className="mx-auto h-3.5 w-3.5" /> : index + 1}. {label}</div>)}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950">
        {step === 1 && <section className="space-y-5"><div><h3 className="text-lg font-semibold">What do you want this agent to do?</h3><p className="mt-1 text-sm text-stone-500">Choose how the conversation starts. You can refine the work in the next steps.</p></div><div className="grid gap-3 md:grid-cols-3">{MODE_OPTIONS.map((option) => <button key={option.mode} type="button" onClick={() => setMode(option.mode)} className={`rounded-xl border p-4 text-left transition ${mode === option.mode ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100 dark:bg-violet-950/40" : "border-stone-200 hover:border-stone-300 dark:border-stone-800"}`}><PhoneCall className={`mb-3 h-5 w-5 ${mode === option.mode ? "text-violet-600" : "text-stone-400"}`} /><p className="font-semibold">{option.title}</p><p className="mt-1 text-xs text-stone-500">{option.description}</p></button>)}</div></section>}

        {step === 2 && <section className="space-y-5"><div><h3 className="text-lg font-semibold">What language should your agent speak?</h3><p className="mt-1 text-sm text-stone-500">The generated opening and conversational examples use this language.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{LANGUAGES.map(([code, name]) => <button key={code} type="button" onClick={() => setLanguage(code)} className={`rounded-lg border px-3 py-3 text-left text-sm ${language === code ? "border-violet-500 bg-violet-50 font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" : "border-stone-200 text-stone-600 dark:border-stone-800 dark:text-stone-300"}`}>{name}</button>)}</div><div className="max-w-sm"><label className="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300">Optional second language</label><select value={secondaryLanguage} onChange={(event) => setSecondaryLanguage(event.target.value)} className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm dark:border-stone-800 dark:bg-stone-900"><option value="">One language only</option>{LANGUAGES.filter(([code]) => code !== language).map(([code, name]) => <option value={code} key={code}>{languageName(language)} + {name}</option>)}</select></div></section>}

        {step === 3 && <section className="space-y-4"><div><h3 className="text-lg font-semibold">Tell me about your business</h3><p className="mt-1 text-sm text-stone-500">Use your own words. We only use the information you provide; no business facts are invented.</p></div><Textarea value={businessDescription} onChange={(event) => setBusinessDescription(event.target.value)} rows={9} placeholder="Example: We are a dental clinic in Hyderabad. We provide consultations, teeth cleaning, braces, and emergency appointments. Most new patients come from our website form." className="text-sm leading-6" /><p className="text-xs text-stone-500">Include your services, customers, location, or anything the agent should understand.</p></section>}

        {step === 4 && <section className="space-y-5"><div><h3 className="text-lg font-semibold">What should the agent do on the call?</h3><p className="mt-1 text-sm text-stone-500">Describe the desired conversation and end result. The agent will ask one question at a time.</p></div><Textarea value={agentGoal} onChange={(event) => setAgentGoal(event.target.value)} rows={7} placeholder="Example: Call people who submitted our website form. Ask what treatment they need and when they would like an appointment. Answer basic questions from our clinic information and capture a consultation request." /><div><label className="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300">Information to collect — optional</label><div className="flex gap-2"><Input value={fieldDraft} onChange={(event) => setFieldDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addField(); } }} placeholder="e.g. Preferred appointment time" /><Button type="button" variant="outline" onClick={addField}><Plus className="mr-1 h-4 w-4" />Add</Button></div><div className="mt-3 flex flex-wrap gap-2">{dataFields.map((field) => <Badge key={field} variant="secondary" className="gap-1.5 py-1.5">{field}<button type="button" aria-label={`Remove ${field}`} onClick={() => setDataFields((current) => current.filter((item) => item !== field))}><Trash2 className="h-3 w-3" /></button></Badge>)}{!dataFields.length && <span className="text-xs text-stone-400">Leave this blank to receive suggestions based on your goal.</span>}</div></div></section>}

        {step === 5 && <section className="space-y-5"><div><h3 className="text-lg font-semibold">Optional business knowledge and FAQs</h3><p className="mt-1 text-sm text-stone-500">Add only facts the agent can safely share. If an answer is not provided, it will offer a human follow-up.</p></div><Textarea value={businessKnowledge} onChange={(event) => setBusinessKnowledge(event.target.value)} rows={5} placeholder="Example: Consultation hours are 9 AM to 6 PM, Monday to Saturday. The clinic is at..." /><div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800"><p className="mb-3 text-sm font-semibold">FAQs</p><div className="grid gap-2 sm:grid-cols-2"><Input value={faqQuestion} onChange={(event) => setFaqQuestion(event.target.value)} placeholder="Question" /><Input value={faqAnswer} onChange={(event) => setFaqAnswer(event.target.value)} placeholder="Verified answer" /></div><Button type="button" size="sm" variant="outline" onClick={addFaq} className="mt-2"><Plus className="mr-1 h-3.5 w-3.5" />Add FAQ</Button>{faqs.length > 0 && <div className="mt-4 space-y-2">{faqs.map((faq, index) => <div key={`${faq.question}-${index}`} className="rounded-lg bg-stone-50 p-3 text-xs dark:bg-stone-900"><div className="flex justify-between gap-3"><div><p className="font-semibold">{faq.question}</p><p className="mt-1 text-stone-500">{faq.answer}</p></div><button type="button" onClick={() => setFaqs((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-3.5 w-3.5 text-stone-400" /></button></div></div>)}</div>}</div></section>}

        {step === 6 && bundle && <section className="space-y-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><h3 className="text-lg font-semibold">Your voice agent is ready</h3><Badge className="bg-emerald-600 text-white">Validated</Badge></div><p className="mt-1 text-sm text-stone-500">{bundle.exported_from.employee_role} · {languageName(bundle.exported_from.language)} · {bundle.exported_from.mode === "bulk" ? "Bulk outbound" : bundle.exported_from.mode}</p></div><Button type="button" variant="outline" onClick={() => setStep(5)}><ArrowLeft className="mr-1 h-4 w-4" />Edit answers</Button></div><div className="rounded-xl border border-violet-100 bg-violet-50 p-4 dark:border-violet-950 dark:bg-violet-950/30"><p className="text-xs font-semibold uppercase tracking-wide text-violet-500">Opening line</p><Input value={bundle.first_response} onChange={(event) => setBundle({ ...bundle, first_response: event.target.value })} className="mt-2 border-violet-200 bg-white text-sm dark:bg-stone-950" /></div><div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><div><p className="mb-2 text-sm font-semibold">Conversation flow</p><div className="space-y-2">{bundle.sections.map((section, index) => <details key={section.section_key} className="group rounded-xl border border-stone-200 px-4 py-3 dark:border-stone-800" open={index < 2}><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><span className="mr-2 text-xs text-stone-400">{index + 1}</span><span className="text-sm font-medium">{section.label}</span></div><ChevronDown className="h-4 w-4 text-stone-400 transition group-open:rotate-180" /></summary><Textarea value={section.prompt} onChange={(event) => updateSection(section.section_key, event.target.value)} rows={7} className="mt-3 text-xs leading-5" /><p className="mt-2 text-[11px] text-stone-400">{section.edges?.length ? `Then: ${section.edges.map((edge) => edge.to_key).join(", ")}` : "Ends the call"}</p></details>)}</div></div><div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800"><p className="text-sm font-semibold">Information plan</p><p className="mt-1 text-xs text-stone-500">Pre-call values are used naturally; capture fields are asked only when needed.</p><div className="mt-4 space-y-2">{bundle.variables.map((variable) => <div key={variable.key} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs dark:bg-stone-900"><span>{variable.label}{variable.required && <span className="ml-1 text-rose-500">*</span>}</span><Badge variant={variable.source === "pre" ? "outline" : "secondary"} className="font-mono text-[10px]">{variable.source}</Badge></div>)}</div></div></div><div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800"><div className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-violet-600" /><p className="text-sm font-semibold">Refine the voice</p></div><div className="mt-3 flex gap-2"><Input value={regenerationInstruction} onChange={(event) => setRegenerationInstruction(event.target.value)} placeholder="e.g. Make it shorter and more casual" /><Button type="button" variant="outline" onClick={regenerate} disabled={regenerating}>{regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerate"}</Button></div><p className="mt-2 text-xs text-stone-500">Regeneration changes phrasing only. Your fields, flow, phone variable, and safeguards stay intact.</p></div></section>}

        {error && <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        {step < 6 && <div className="mt-7 flex items-center justify-between border-t border-stone-100 pt-5 dark:border-stone-800"><Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>{step === 5 ? <Button type="button" variant="gold" onClick={generate} disabled={!canAdvance || generating}>{generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Designing your agent…</> : <><Sparkles className="mr-2 h-4 w-4" />Generate agent</>}</Button> : <Button type="button" onClick={() => setStep((current) => current + 1)} disabled={!canAdvance}>Continue<ArrowRight className="ml-1 h-4 w-4" /></Button>}</div>}
        {step === 6 && bundle && <div className="mt-7 flex flex-col justify-between gap-3 border-t border-stone-100 pt-5 sm:flex-row dark:border-stone-800"><Button type="button" variant="outline" onClick={() => save(false)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save draft</Button><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setStep(5)}>Review inputs</Button><Button type="button" variant="gold" onClick={() => save(true)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}Publish & test</Button></div></div>}
      </div>

      {savedAgentId && <TestCallDialog isOpen={testOpen} onClose={() => setTestOpen(false)} defaultAgentId={savedAgentId} />}
    </div>
  );
}
