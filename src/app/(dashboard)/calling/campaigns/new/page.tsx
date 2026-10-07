"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Check,
  FileSpreadsheet,
  Download,
  Bot,
  Phone,
  Clock,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAgents } from "@/lib/api/agents";
import { createCampaign } from "@/lib/api/campaigns";
import { Agent } from "@/lib/types/sigulon";

const STEPS = [
  "Details",
  "Import Leads",
  "Select Agent",
  "Phone Number",
  "Calling Config",
  "Review & Launch",
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentsList, setAgentsList] = useState<Agent[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: "Outbound Outreach Campaign",
    description: "Outbound lead qualification campaign",
    fileName: "",
    leadsCount: 0,
    agentId: "",
    callerId: "+91 80 4719 3320",
    maxConcurrency: 10,
    callingHoursStart: "10:00",
    callingHoursEnd: "19:00",
    retryAttempts: 2,
    retryDelayMinutes: 60,
    dailyLimit: 300,
    maxAttemptsPerLead: 3,
    dncScrub: true,
  });

  useEffect(() => {
    async function loadAgents() {
      try {
        const ags = await getAgents();
        setAgentsList(ags);
        if (ags.length > 0) {
          setFormData((prev) => ({ ...prev, agentId: prev.agentId || ags[0].id }));
        }
      } catch (err) {
        console.error("[campaigns/new] Error loading agents:", err);
      }
    }
    loadAgents();
  }, []);

  const selectedAgent =
    agentsList.find((a) => a.id === formData.agentId) || agentsList[0];

  const estimatedMinutes = Math.floor(formData.leadsCount * 2.2);
  const estimatedCost = (estimatedMinutes * 0.85).toFixed(2);

  const handleLaunch = async () => {
    if (!selectedAgent) return;
    setIsSubmitting(true);
    try {
      await createCampaign({
        name: formData.name,
        description: formData.description,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        leadsCount: formData.leadsCount,
        callerId: formData.callerId,
        maxConcurrency: formData.maxConcurrency,
        callingHours: {
          start: formData.callingHoursStart,
          end: formData.callingHoursEnd,
        },
        retryAttempts: formData.retryAttempts,
        retryDelayMinutes: formData.retryDelayMinutes,
        dailyLimit: formData.dailyLimit,
        maxAttemptsPerLead: formData.maxAttemptsPerLead,
        status: "running",
      });
      router.push("/calling/campaigns");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/calling/campaigns"
          className="p-1.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            Create Bulk Campaign
          </h1>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
            Configure contact list import, agent routing, pacing, and compliance governors.
          </p>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between overflow-x-auto gap-2">
          {STEPS.map((label, idx) => {
            const stepNum = idx + 1;
            const isCompleted = step > stepNum;
            const isCurrent = step === stepNum;

            return (
              <button
                key={label}
                onClick={() => setStep(stepNum)}
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
                  {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : stepNum}
                </div>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Details */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">1. Campaign Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Campaign Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Description / Campaign Goal
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Import Leads */}
      {step === 2 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">2. Import Leads (CSV / Excel)</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Upload your target lead roster. Custom columns will map to agent variables.
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              <span>Sample CSV</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-8 border-2 border-dashed border-gray-200 dark:border-neutral-800 rounded-xl text-center hover:bg-gray-50/50 dark:hover:bg-neutral-800/20 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Drag & drop your CSV file here
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Required columns: <code>name</code>, <code>phone</code> (with +91). Optional: <code>email</code>, <code>city</code>, <code>vehicle_reg</code>.
              </p>
            </div>

            {/* Uploaded File Pill */}
            <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-white">
                  {formData.fileName}
                </span>
                <span className="text-gray-400">({formData.leadsCount} contacts detected)</span>
              </div>
              <Badge variant="success">Parsed Successfully</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Select Agent */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">3. Select AI Voice Agent</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Choose the configured agent who will execute the outbound conversation turns.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {agentsList.map((ag) => (
              <label
                key={ag.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  formData.agentId === ag.id
                    ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500"
                    : "border-gray-200 dark:border-neutral-800 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="agentId"
                    value={ag.id}
                    checked={formData.agentId === ag.id}
                    onChange={() => setFormData({ ...formData, agentId: ag.id })}
                    className="accent-blue-600"
                  />
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">
                      {ag.name}
                    </div>
                    <div className="text-xs text-gray-500">{ag.role} · {ag.language}</div>
                  </div>
                </div>
                <Badge variant={ag.status === "ready" ? "success" : "secondary"}>
                  {ag.status}
                </Badge>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Phone Number */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">4. Outbound Telephony Trunk</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Select the caller ID number displayed on recipients' mobile screens.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                Caller ID Line *
              </label>
              <select
                value={formData.callerId}
                onChange={(e) => setFormData({ ...formData, callerId: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white font-mono"
              >
                <option value="+91 80 4719 3320">+91 80 4719 3320 (Bangalore — Plivo SIP Trunk)</option>
                <option value="+91 40 4912 8840">+91 40 4912 8840 (Hyderabad — Plivo SIP Trunk)</option>
                <option value="+91 22 5064 1190">+91 22 5064 1190 (Mumbai — Plivo SIP Trunk)</option>
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: Calling Config & Safety */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">5. Concurrency & Schedule Settings</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure governor limits and permissible Indian calling windows (TRAI compliant).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Max Concurrent Lines ({formData.maxConcurrency} calls)
                </label>
                <input
                  type="range"
                  min="2"
                  max="30"
                  value={formData.maxConcurrency}
                  onChange={(e) =>
                    setFormData({ ...formData, maxConcurrency: parseInt(e.target.value) })
                  }
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Daily Call Limit</label>
                <input
                  type="number"
                  value={formData.dailyLimit}
                  onChange={(e) =>
                    setFormData({ ...formData, dailyLimit: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Calling Hours Start (IST)</label>
                <input
                  type="time"
                  value={formData.callingHoursStart}
                  onChange={(e) =>
                    setFormData({ ...formData, callingHoursStart: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Calling Hours End (IST)</label>
                <input
                  type="time"
                  value={formData.callingHoursEnd}
                  onChange={(e) =>
                    setFormData({ ...formData, callingHoursEnd: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-neutral-700"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gray-50 dark:bg-neutral-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Automatic TRAI DNC (Do Not Call) Scrubbing</span>
              </div>
              <input
                type="checkbox"
                checked={formData.dncScrub}
                onChange={(e) => setFormData({ ...formData, dncScrub: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 6: Review & Launch */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">6. Review & Launch Campaign</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Verify parameters before initiating batch dialing.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400">Campaign:</span>
                  <div className="font-semibold text-gray-900 dark:text-white mt-0.5">
                    {formData.name}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Assigned Agent:</span>
                  <div className="font-semibold text-gray-900 dark:text-white mt-0.5">
                    {selectedAgent ? `${selectedAgent.name} (${selectedAgent.language})` : "None"}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Total Leads:</span>
                  <div className="font-mono font-semibold text-gray-900 dark:text-white mt-0.5">
                    {formData.leadsCount} contacts
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Estimated Cost:</span>
                  <div className="font-mono font-bold text-emerald-600 mt-0.5">
                    ~₹{estimatedCost} ({estimatedMinutes} mins)
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom Nav */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-neutral-800">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || isSubmitting}
        >
          Previous
        </Button>

        {step < 6 ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setStep((s) => Math.min(6, s + 1))}
            className="gap-1.5"
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleLaunch}
            disabled={isSubmitting}
            className="gap-2 min-w-36"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Launch campaign</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
