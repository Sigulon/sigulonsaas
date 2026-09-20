"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceAgent } from "@/lib/types";
import { normalizePhone } from "@/lib/phone";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
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
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agents load after mount on the campaigns page — fall back to the first
  // agent until the user picks one, instead of leaving Continue disabled.
  // Derived during render (no setState-in-effect) so lint stays clean.
  const effectiveAgentId = selectedAgentId || agents[0]?.id || "";

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
          agentId: effectiveAgentId,
          contacts: parsedContacts,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create campaign");
      }

      const campaignId = createData.campaign.id;

      // 2. Launch execution of campaign batch queue — a failed start must
      // not look like a launch: surface it and keep the wizard open.
      const startRes = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: "POST",
      });
      if (!startRes.ok) {
        const startData = await startRes.json().catch(() => ({}));
        throw new Error((startData as { error?: string }).error || "Campaign created but failed to start");
      }

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
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
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
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                Assign AI Voice Agent
              </label>
              <select
                value={effectiveAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
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
                disabled={!campaignName.trim() || !effectiveAgentId}
                onClick={() => setStep("upload")}
                className="bg-violet-600 hover:bg-violet-700"
              >
                Continue to Contacts Upload →
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Upload CSV */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-[20px] border-2 border-dashed border-stone-300 dark:border-stone-700 p-8 text-center hover:border-violet-500 transition-colors">
              <UploadCloud className="mx-auto h-12 w-12 text-stone-400" />
              <h3 className="mt-2 text-sm font-semibold text-stone-900 dark:text-white">
                Upload Contacts CSV File
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                CSV should have columns like <span className="font-mono">name</span> and <span className="font-mono">phone</span> (e.g. +919876543210).
              </p>
              <label className="mt-4 inline-block">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <span className="cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">
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
            <div className="flex items-center justify-between rounded-xl bg-stone-50 dark:bg-stone-900 p-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-violet-600" />
                <span className="font-medium text-xs text-stone-800 dark:text-stone-200">
                  {fileName}
                </span>
              </div>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {parsedContacts.length} Contacts Ready
              </span>
            </div>

            {/* Preview table */}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 text-xs">
              <table className="w-full text-left">
                <thead className="border-b border-stone-200 bg-stone-50 p-2 font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-900">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Phone Number</th>
                    <th className="p-2">Compliance Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {parsedContacts.slice(0, 5).map((c, i) => {
                    const valid = Boolean(normalizePhone(c.phone_number));
                    return (
                    <tr key={i}>
                      <td className="p-2 text-stone-800 dark:text-stone-200">{c.name}</td>
                      <td className="p-2 font-mono text-stone-600 dark:text-stone-400">{c.phone_number}</td>
                      {valid ? (
                      <td className="p-2 text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Valid
                      </td>
                      ) : (
                      <td className="p-2 text-red-600 flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Invalid
                      </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsedContacts.length > 5 && (
                <div className="p-2 text-center text-[11px] text-stone-400 bg-stone-50/50">
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
                className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-2"
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
