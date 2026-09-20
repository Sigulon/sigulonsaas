"use client";

import { useEffect, useState, useCallback } from "react";
import { Campaign, VoiceAgent } from "@/lib/types";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import {
  Megaphone,
  Plus,
  Play,
  CheckCircle2,
  Users,
  Loader2,
  Clock,
} from "lucide-react";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [campRes, agentsRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/agents"),
      ]);

      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaigns(campData.campaigns || []);
      }

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData.agents || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    loadData();
  }, [loadData]);

  const handleStartBatch = async (campaignId: string) => {
    setActionInProgress(campaignId);
    setActionError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: "POST",
      });
      if (res.ok) {
        await loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError((data as { error?: string }).error || `Start failed (${res.status}). Please retry.`);
      }
    } catch (e) {
      console.error("Batch dispatch error", e);
      setActionError("Start failed. Please check your connection and retry.");
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-violet-600" />
            Campaigns
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Put your team on bulk dialing — rate limited, DNC filtered, with live progress.
          </p>
        </div>

        <Button
          onClick={() => setIsWizardOpen(true)}
          variant="gold"
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Create Bulk Campaign
        </Button>
      </div>

      {/* Explainer header: upload, auto-dial, live analytics */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { step: "Upload", detail: "Drop a CSV of names and numbers." },
          { step: "Auto-dial", detail: "Your agent calls the list for you." },
          { step: "Live analytics", detail: "Watch progress and outcomes here." },
        ].map((item) => (
          <div key={item.step} className="rounded-2xl border border-stone-200/70 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
            <span className="block text-sm font-semibold text-stone-900 dark:text-white">{item.step}</span>
            <span className="mt-0.5 block text-xs text-stone-500">{item.detail}</span>
          </div>
        ))}
      </div>

      {/* Campaigns Grid */}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {actionError}
        </div>
      )}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mb-2" />
          <span className="text-sm">Loading campaigns...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-[20px] border-2 border-dashed border-stone-200 dark:border-stone-800 p-12 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-stone-400" />
          <h3 className="mt-3 text-base font-semibold text-stone-900 dark:text-white">
            No campaigns yet
          </h3>
          <p className="mt-1 text-xs text-stone-500 max-w-sm mx-auto">
            Upload a contacts CSV and your team starts dialing — DNC filtered, automatically.
          </p>
          <Button
            onClick={() => setIsWizardOpen(true)}
            className="mt-4"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create First Campaign
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map((camp) => {
            const pct =
              camp.total_contacts > 0
                ? Math.round((camp.calls_completed / camp.total_contacts) * 100)
                : 0;

            const isCompleted = camp.status === "completed" || pct >= 100;
            const isProcessing = actionInProgress === camp.id;

            return (
              <Card key={camp.id} className="flex flex-col justify-between shadow-[0_8px_30px_rgba(30,20,60,0.08)]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-base text-stone-900 dark:text-white">
                        {camp.name}
                      </h3>
                      <span className="text-xs text-stone-500">
                        Assigned Agent: <strong className="text-stone-800 dark:text-stone-200">{camp.agent?.name || (camp as Campaign & { voice_agents?: { name?: string } }).voice_agents?.name || "Voice Agent"}</strong>
                      </span>
                    </div>

                    <Badge
                      variant={
                        isCompleted
                          ? "success"
                          : camp.status === "running"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      {camp.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-stone-500 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-stone-400" />
                        Calls Completed
                      </span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">
                        {camp.calls_completed} / {camp.total_contacts} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-600 to-emerald-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-400 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {new Date(camp.created_at).toLocaleDateString()}
                    </span>
                    <span>Concurrency Limit: 5 simultaneous lines</span>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-stone-400">
                    ID: {camp.id.slice(0, 8)}
                  </span>

                  {!isCompleted ? (
                    <Button
                      size="sm"
                      onClick={() => handleStartBatch(camp.id)}
                      disabled={isProcessing}
                      className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Dispatching Batch...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-white" />
                          <span>Dispatch Next Batch</span>
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Campaign Finished
                    </span>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        agents={agents}
        onCampaignCreated={loadData}
      />
    </div>
  );
}
