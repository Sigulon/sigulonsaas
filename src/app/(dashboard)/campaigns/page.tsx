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
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: "POST",
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error("Batch dispatch error", e);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-indigo-600" />
            Outbound Calling Campaigns
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dispatch high-volume automated voice campaigns with rate limiting, DNC filtering, and real-time progress.
          </p>
        </div>

        <Button
          onClick={() => setIsWizardOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Create Bulk Campaign
        </Button>
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
          <span className="text-sm">Loading campaigns...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
            No Outbound Campaigns Yet
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Upload your contacts CSV to launch automated bulk calling in Indian languages.
          </p>
          <Button
            onClick={() => setIsWizardOpen(true)}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700"
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
              <Card key={camp.id} className="flex flex-col justify-between shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                        {camp.name}
                      </h3>
                      <span className="text-xs text-slate-500">
                        Assigned Agent: <strong className="text-slate-800 dark:text-slate-200">{camp.agent?.name || "Voice Agent"}</strong>
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
                      <span className="text-slate-500 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        Calls Completed
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {camp.calls_completed} / {camp.total_contacts} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {new Date(camp.created_at).toLocaleDateString()}
                    </span>
                    <span>Concurrency Limit: 5 simultaneous lines</span>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    ID: {camp.id.slice(0, 8)}
                  </span>

                  {!isCompleted ? (
                    <Button
                      size="sm"
                      onClick={() => handleStartBatch(camp.id)}
                      disabled={isProcessing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
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
