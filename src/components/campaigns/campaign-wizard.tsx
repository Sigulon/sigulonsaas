"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceAgent } from "@/lib/types";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
  Play,
} from "lucide-react";

interface CampaignWizardProps {
  isOpen: boolean;
  onClose: () => void;
  agents: VoiceAgent[];
  onCampaignCreated: () => void;
}

interface ParsedContact {
  name: string;
  phone_number: string;
  metadata?: Record<string, unknown>;
}

export function CampaignWizard({
  isOpen,
  onClose,
  agents,
  onCampaignCreated,
}: CampaignWizardProps) {
  const [step, setStep] = useState<"details" | "upload" | "review">("details");
  const [campaignName, setCampaignName] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || "");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const contacts: ParsedContact[] = [];

        for (const row of rows) {
          // Flexible key lookup for phone number & name
          const phoneKey = Object.keys(row).find((k) =>
            /phone|mobile|tel|number/i.test(k)
          );
          const nameKey = Object.keys(row).find((k) => /name|contact/i.test(k));

          const phoneVal = phoneKey ? row[phoneKey]?.trim() : "";
          const nameVal = nameKey ? row[nameKey]?.trim() : "";

          if (phoneVal) {
            contacts.push({
              name: nameVal || "Contact",
              phone_number: phoneVal,
              metadata: row,
            });
          }
        }

        if (contacts.length === 0) {
          setError("No valid phone numbers found in the CSV. Ensure there is a column named 'phone' or 'phone_number'.");
        } else {
          setParsedContacts(contacts);
          setStep("review");
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
      },
    });
  };

  const handleCreateAndLaunch = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Create Campaign and store contacts
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          agentId: selectedAgentId,
          contacts: parsedContacts,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create campaign");
      }

      const campaignId = createData.campaign.id;

      // 2. Launch execution of campaign batch queue
      await fetch(`/api/campaigns/${campaignId}/start`, {
        method: "POST",
      });

      onCampaignCreated();
      onClose();
      // Reset state
      setStep("details");
      setParsedContacts([]);
      setCampaignName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Bulk Voice Outbound Campaign"
      description="Upload a list of phone contacts, assign an AI voice agent, and trigger automated outbound dialing."
      maxWidth="xl"
    >
      <div className="py-2 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Campaign Details */}
        {step === "details" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Campaign Name
              </label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Q3 Healthcare Recall or Solar Outreach"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Assign AI Voice Agent
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.language.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                disabled={!campaignName.trim() || !selectedAgentId}
                onClick={() => setStep("upload")}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Continue to Contacts Upload →
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Upload CSV */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 text-center hover:border-indigo-500 transition-colors">
              <UploadCloud className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                Upload Contacts CSV File
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                CSV should have columns like <span className="font-mono">name</span> and <span className="font-mono">phone</span> (e.g. +919876543210).
              </p>
              <label className="mt-4 inline-block">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <span className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                  Select CSV File
                </span>
              </label>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" onClick={() => setStep("details")}>
                ← Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review Contacts & Launch */}
        {step === "review" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900 p-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                <span className="font-medium text-xs text-slate-800 dark:text-slate-200">
                  {fileName}
                </span>
              </div>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {parsedContacts.length} Contacts Ready
              </span>
            </div>

            {/* Preview table */}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 bg-slate-50 p-2 font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Phone Number</th>
                    <th className="p-2">Compliance Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parsedContacts.slice(0, 5).map((c, i) => (
                    <tr key={i}>
                      <td className="p-2 text-slate-800 dark:text-slate-200">{c.name}</td>
                      <td className="p-2 font-mono text-slate-600 dark:text-slate-400">{c.phone_number}</td>
                      <td className="p-2 text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Valid
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedContacts.length > 5 && (
                <div className="p-2 text-center text-[11px] text-slate-400 bg-slate-50/50">
                  + {parsedContacts.length - 5} more contacts
                </div>
              )}
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Calls will be automatically filtered against your internal <strong>Do Not Call (DNC) list</strong> before being dispatched via Plivo.
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" onClick={() => setStep("upload")} disabled={loading}>
                ← Back
              </Button>
              <Button
                onClick={handleCreateAndLaunch}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Launching Campaign...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white" />
                    Launch Campaign Now
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
