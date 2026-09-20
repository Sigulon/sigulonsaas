"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  Plus,
  Key,
  ShieldCheck,
  Bot,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Globe,
  Radio,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface PhoneNumberItem {
  id: string;
  phoneNumber: string;
  countryCode: string;
  provider: string;
  direction: "inbound" | "outbound" | "both";
  status: string;
  agentId: string | null;
  agentName: string | null;
  createdAt: string;
}

interface AgentOption {
  id: string;
  name: string;
}

interface TelephonyStatus {
  configured: boolean;
  provider: string;
  authIdMasked: string;
  source: "byoc" | "env" | "none";
  status: string;
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumberItem[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [telephonyStatus, setTelephonyStatus] = useState<TelephonyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Plivo Credentials Form
  const [authId, setAuthId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [testingCreds, setTestingCreds] = useState(false);
  const [credsSuccess, setCredsSuccess] = useState<string | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);

  // Add Number Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newDirection, setNewDirection] = useState<"both" | "inbound" | "outbound">("both");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [addingNumber, setAddingNumber] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Copy helper
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [numRes, agentRes, credsRes] = await Promise.all([
        fetch("/api/phone-numbers"),
        fetch("/api/agents"),
        fetch("/api/telephony/credentials"),
      ]);

      if (numRes.ok) {
        const data = await numRes.json();
        setNumbers(data.phoneNumbers || []);
      }

      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgents((data.agents || []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
      }

      if (credsRes.ok) {
        const data = await credsRes.json();
        setTelephonyStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch telephony data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch owns loading state.
    fetchData();
  }, [fetchData]);

  // Test Plivo Credentials
  const handleTestCredentials = async () => {
    if (!authId || !authToken) return;
    setTestingCreds(true);
    setCredsSuccess(null);
    setCredsError(null);

    try {
      const res = await fetch("/api/telephony/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId, authToken, validateOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Plivo connection verification failed");

      setCredsSuccess(`Connection successful! Plivo account verified (${data.accountType || "standard"}).`);
    } catch (err: unknown) {
      setCredsError(err instanceof Error ? err.message : "Plivo connection verification failed");
    } finally {
      setTestingCreds(false);
    }
  };

  // Save Plivo Credentials
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    setCredsSuccess(null);
    setCredsError(null);

    try {
      const res = await fetch("/api/telephony/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId, authToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save credentials");

      setCredsSuccess(data.message || "Plivo credentials encrypted and stored securely.");
      setAuthId("");
      setAuthToken("");
      fetchData();
    } catch (err: unknown) {
      setCredsError(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setSavingCreds(false);
    }
  };

  // Add new phone number
  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingNumber(true);
    setAddError(null);

    try {
      const res = await fetch("/api/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: newNumber.trim(),
          direction: newDirection,
          agentId: selectedAgentId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add phone number");

      setIsAddModalOpen(false);
      setNewNumber("");
      setSelectedAgentId("");
      fetchData();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add phone number");
    } finally {
      setAddingNumber(false);
    }
  };

  // Assign or reassign agent for a number
  const handleReassignAgent = async (numberId: string, newAgentId: string) => {
    try {
      const res = await fetch(`/api/phone-numbers/${numberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: newAgentId || null }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to reassign agent", err);
    }
  };

  // Delete a phone number
  const handleDeleteNumber = async (numberId: string) => {
    if (!confirm("Are you sure you want to remove this phone number?")) return;

    try {
      const res = await fetch(`/api/phone-numbers/${numberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete phone number", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const [originUrl, setOriginUrl] = useState("http://localhost:3000");

  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser origin is read once after mount.
      setOriginUrl(window.location.origin);
    }
  }, []);

  const inboundWebhookUrl = `${originUrl}/api/webhooks/plivo/inbound`;
  const fallbackWebhookUrl = `${originUrl}/api/webhooks/plivo/status`;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Radio className="h-6 w-6 text-indigo-600" />
            Telephony & Phone Numbers
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure your Plivo carrier account, manage inbound/outbound phone numbers, and attach them to your AI Voice Agents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Register Plivo Number
          </Button>
        </div>
      </div>

      {/* Grid: Carrier Config & Webhook Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plivo Account Credentials */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Plivo Carrier Credentials (BYOC)
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    Bring Your Own Carrier credentials for direct telephony routing
                  </span>
                </div>
              </div>

              {telephonyStatus?.configured ? (
                <Badge variant="success" className="text-[10px]">
                  ACTIVE ({telephonyStatus.source.toUpperCase()})
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  UNCONFIGURED
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            {telephonyStatus?.configured && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/60 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200 block">
                      Carrier Connected
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                      Auth ID: {telephonyStatus.authIdMasked}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                  AES-256 Encrypted
                </span>
              </div>
            )}

            <form onSubmit={handleSaveCredentials} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Plivo Auth ID (e.g. MAMW...)
                </label>
                <Input
                  type="text"
                  placeholder="Enter your Plivo Auth ID"
                  value={authId}
                  onChange={(e) => setAuthId(e.target.value)}
                  className="text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Plivo Auth Token
                </label>
                <Input
                  type="password"
                  placeholder="Enter your Plivo Auth Token"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="text-xs font-mono"
                  required
                />
              </div>

              {credsError && (
                <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                  {credsError}
                </div>
              )}

              {credsSuccess && (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                  {credsSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestCredentials}
                  disabled={testingCreds || savingCreds || !authId || !authToken}
                  className="text-xs"
                >
                  {testingCreds ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Verifying...
                    </>
                  ) : (
                    "Test Connection"
                  )}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingCreds || testingCreds || !authId || !authToken}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  {savingCreds ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Verifying & Saving...
                    </>
                  ) : (
                    "Save Credentials"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Plivo Webhook Callback Configuration */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Plivo Console Webhook Setup
                </h2>
                <span className="text-[11px] text-slate-400">
                  Copy these webhook URLs into your Plivo Voice XML Application
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
            <p>
              In your <strong>Plivo Console &gt; Voice &gt; Applications</strong>, create an application and configure the primary answer URL:
            </p>

            {/* Inbound URL */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Primary Answer URL (POST):
                </span>
                <button
                  onClick={() => copyToClipboard(inboundWebhookUrl)}
                  className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-[11px]"
                >
                  {copiedUrl === inboundWebhookUrl ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy URL
                    </>
                  )}
                </button>
              </div>
              <code className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400 break-all block">
                {inboundWebhookUrl}
              </code>
            </div>

            {/* Fallback URL */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Fallback URL (POST):
                </span>
                <button
                  onClick={() => copyToClipboard(fallbackWebhookUrl)}
                  className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-[11px]"
                >
                  {copiedUrl === fallbackWebhookUrl ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy URL
                    </>
                  )}
                </button>
              </div>
              <code className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400 break-all block">
                {fallbackWebhookUrl}
              </code>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <a
                href="https://console.plivo.com/voice/applications/"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline inline-flex items-center gap-1 text-xs font-semibold"
              >
                Open Plivo Voice Console
                <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-[11px] text-slate-400">Method: POST</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Phone Numbers Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Connected Telephony Numbers
            </h2>
            <p className="text-xs text-slate-500">
              Numbers linked to this organization with their active agent routing assignments.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {numbers.length} {numbers.length === 1 ? "Number" : "Numbers"} Registered
          </span>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
            <span className="text-xs">Loading phone numbers...</span>
          </div>
        ) : numbers.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
            <Phone className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              No Phone Numbers Connected
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Add your Plivo telephone number to allow your voice agents to make and receive calls.
            </p>
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Phone Number
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-950 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-900/50 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Direction</th>
                    <th className="py-3 px-4">Assigned AI Agent</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {numbers.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-indigo-600" />
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                            {item.phoneNumber}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300 uppercase">
                          {item.provider}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {item.direction}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-slate-400" />
                          <select
                            value={item.agentId || ""}
                            onChange={(e) => handleReassignAgent(item.id, e.target.value)}
                            className="text-xs bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-md px-2 py-1 font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">— Unassigned (Inbound park) —</option>
                            {agents.map((ag) => (
                              <option key={ag.id} value={ag.id}>
                                {ag.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={item.status === "active" ? "success" : "secondary"}>
                          {item.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDeleteNumber(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                          title="Remove number"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Number Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Connect Plivo Phone Number"
        description="Register an existing Plivo telephone number and assign it to an AI voice agent."
        maxWidth="md"
      >
        <form onSubmit={handleAddNumber} className="space-y-4 pt-2 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Phone Number (E.164 format)
            </label>
            <Input
              type="text"
              placeholder="+919876543210 or +15551234567"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              className="text-xs font-mono"
              required
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Enter your rented Plivo number with country code (e.g. +91 for India, +1 for US).
            </span>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Call Direction
            </label>
            <select
              value={newDirection}
              onChange={(e) => setNewDirection(e.target.value as "both" | "inbound" | "outbound")}
              className="w-full text-xs bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-lg p-2 font-medium"
            >
              <option value="both">Both (Inbound & Outbound)</option>
              <option value="inbound">Inbound Only</option>
              <option value="outbound">Outbound Only</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Attach to Voice Agent (Optional)
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-lg p-2 font-medium"
            >
              <option value="">— Leave Unassigned —</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Inbound calls to this number will immediately be answered by this voice agent.
            </span>
          </div>

          {addError && (
            <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
              {addError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={addingNumber || !newNumber.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {addingNumber ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Registering...
                </>
              ) : (
                "Save & Attach Number"
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
