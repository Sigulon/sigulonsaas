"use client";

import { useState } from "react";
import {
  Settings,
  Users,
  Key,
  Webhook,
  Phone,
  Shield,
  Save,
  Check,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "general" | "team" | "apikeys" | "webhooks" | "calling" | "security"
  >("general");

  const [isSaved, setIsSaved] = useState(false);

  // General Settings State
  const [general, setGeneral] = useState({
    workspaceName: "Sigulon AI",
    companyName: "Acme Health & Wellness",
    timezone: "Asia/Kolkata (IST)",
    defaultLanguage: "Telugu / English",
  });

  // Team State
  const [teamMembers] = useState([
    { id: "1", name: "Praveen", email: "praveen@sigulon.ai", role: "Owner" },
    { id: "2", name: "Ramesh Kumar", email: "ramesh@acmeinsurance.in", role: "Admin" },
    { id: "3", name: "Priya V.", email: "priya@acmeinsurance.in", role: "Member" },
  ]);

  // API Keys State
  const [apiKeys, setApiKeys] = useState([
    { id: "k-1", name: "Production LiveKit Worker", key: "sig_live_79a2f...4d98", created: "2026-09-15" },
    { id: "k-2", name: "Campaign Dial Webhook", key: "sig_live_38b1c...99a0", created: "2026-10-01" },
  ]);

  // Webhooks State
  const [webhooks, setWebhooks] = useState({
    url: "https://api.acmeinsurance.in/v1/leads/webhook",
    events: ["call.completed", "lead.qualified", "campaign.finished"],
  });

  // Calling Settings
  const [callingSettings, setCallingSettings] = useState({
    defaultCallerId: "+91 80 4719 3320",
    recordCalls: true,
    noiseSuppression: true,
    amdEnabled: true,
  });

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
          Workspace parameters, access control, developer keys, and telephony policies.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: "general", label: "General", icon: Settings },
            { id: "team", label: "Team", icon: Users },
            { id: "apikeys", label: "API Keys", icon: Key },
            { id: "webhooks", label: "Webhooks", icon: Webhook },
            { id: "calling", label: "Calling", icon: Phone },
            { id: "security", label: "Security", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: GENERAL */}
      {activeTab === "general" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">General Workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-neutral-300">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={general.workspaceName}
                  onChange={(e) => setGeneral({ ...general, workspaceName: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-neutral-300">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={general.companyName}
                  onChange={(e) => setGeneral({ ...general, companyName: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-neutral-300">
                  Default Timezone
                </label>
                <input
                  type="text"
                  readOnly
                  value={general.timezone}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-gray-500"
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-neutral-300">
                  Default Language Pair
                </label>
                <input
                  type="text"
                  value={general.defaultLanguage}
                  onChange={(e) => setGeneral({ ...general, defaultLanguage: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={handleSave} className="gap-1.5">
                {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                <span>{isSaved ? "Saved" : "Save Settings"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: TEAM */}
      {activeTab === "team" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Team Members & Access</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Collaborate with operators, underwriters, and sales managers.
              </p>
            </div>
            <Button variant="primary" size="sm" className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              <span>Invite Member</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                    <th className="py-2.5 px-4">Member</th>
                    <th className="py-2.5 px-4 font-mono">Email</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {teamMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50/60 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                        {m.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-500">{m.email}</td>
                      <td className="py-3 px-3">
                        <Badge variant={m.role === "Owner" ? "blue" : "secondary"}>{m.role}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-400">
                        {m.role !== "Owner" && (
                          <button className="text-red-600 hover:underline">Remove</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: API KEYS */}
      {activeTab === "apikeys" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">API Credentials</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Authenticate server-to-server calls and LiveKit dispatch workers.
              </p>
            </div>
            <Button variant="primary" size="sm" className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              <span>Create Key</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {apiKeys.map((k) => (
              <div
                key={k.id}
                className="p-3.5 rounded-xl border border-gray-200 dark:border-neutral-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{k.name}</div>
                  <div className="font-mono text-gray-500 mt-0.5">{k.key}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  <button className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: WEBHOOKS */}
      {activeTab === "webhooks" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Real-Time Event Webhooks</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Receive instant JSON HTTP POST updates when calls conclude or leads qualify.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <label className="block font-medium mb-1">Webhook Endpoint URL</label>
              <input
                type="url"
                value={webhooks.url}
                onChange={(e) => setWebhooks({ ...webhooks, url: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono border rounded-lg bg-white dark:bg-neutral-900"
              />
            </div>

            <div>
              <label className="block font-medium mb-1.5">Subscribed Events</label>
              <div className="space-y-2">
                {["call.completed", "lead.qualified", "campaign.finished"].map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-gray-700 dark:text-neutral-300">
                    <input type="checkbox" defaultChecked className="accent-blue-600" />
                    <code className="text-blue-600 font-mono text-[11px]">{ev}</code>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={handleSave}>
                Save Webhook
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 5: CALLING */}
      {activeTab === "calling" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Telephony & Audio Engine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">Call Recording</div>
                <div className="text-gray-500 text-[11px]">
                  Store two-way call audio securely in Cloudflare R2 for compliance
                </div>
              </div>
              <input
                type="checkbox"
                checked={callingSettings.recordCalls}
                onChange={(e) =>
                  setCallingSettings({ ...callingSettings, recordCalls: e.target.checked })
                }
                className="accent-blue-600 w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  LiveKit DeepFilterNet Noise Suppression
                </div>
                <div className="text-gray-500 text-[11px]">
                  Removes Indian ambient road and fan noise before Deepgram STT
                </div>
              </div>
              <input
                type="checkbox"
                checked={callingSettings.noiseSuppression}
                onChange={(e) =>
                  setCallingSettings({ ...callingSettings, noiseSuppression: e.target.checked })
                }
                className="accent-blue-600 w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  Answering Machine Detection (AMD)
                </div>
                <div className="text-gray-500 text-[11px]">
                  Detect IVR / telecom carrier voicemail beeps and disconnect gracefully
                </div>
              </div>
              <input
                type="checkbox"
                checked={callingSettings.amdEnabled}
                onChange={(e) =>
                  setCallingSettings({ ...callingSettings, amdEnabled: e.target.checked })
                }
                className="accent-blue-600 w-4 h-4"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 6: SECURITY */}
      {activeTab === "security" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Security & Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 border rounded-lg flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  Two-Factor Authentication (2FA)
                </div>
                <div className="text-gray-500 text-[11px]">
                  Require authenticator TOTP on staff login
                </div>
              </div>
              <Badge variant="success">Enabled</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
