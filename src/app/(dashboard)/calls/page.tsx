"use client";

import { useEffect, useState, useCallback } from "react";
import { CallsTable } from "@/components/calls/calls-table";
import { CallRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import { PhoneCall, RefreshCw, Loader2, CheckCircle2, PhoneMissed, PhoneOutgoing } from "lucide-react";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/calls?limit=100");
      if (res.ok) {
        const data = await res.json();
        setCalls(data.calls || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    fetchCalls();
  }, [fetchCalls]);

  const total = calls.length;
  const answered = calls.filter((c) => c.status === "completed" || c.status === "answered").length;
  const interested = calls.filter((c) => c.outcome === "interested").length;
  const callbacks = calls.filter((c) => c.outcome === "callback_requested").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-violet-600" />
            Conversations
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Every call your team makes or takes — dispositions, recordings, and transcripts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCalls}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsTestCallOpen(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Test Dial
          </Button>
        </div>
      </div>

      {/* Stat tiles from call outcomes */}
      {!loading && calls.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: PhoneOutgoing, label: "Total calls", value: total.toLocaleString() },
            { icon: CheckCircle2, label: "Answered", value: answered.toLocaleString() },
            { icon: PhoneCall, label: "Interested", value: interested.toLocaleString() },
            { icon: PhoneMissed, label: "Callbacks", value: callbacks.toLocaleString() },
          ].map((tile) => (
            <Card key={tile.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="grid size-9 shrink-0 place-content-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                  <tile.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-lg font-bold leading-none text-stone-900 dark:text-white">
                    {tile.value}
                  </span>
                  <span className="mt-1 block text-[11px] text-stone-500">{tile.label}</span>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mb-2" />
          <span className="text-sm">Fetching call records...</span>
        </div>
      ) : calls.length === 0 ? (
        <div className="rounded-[20px] border-2 border-dashed border-stone-200 dark:border-stone-800 p-12 text-center">
          <PhoneCall className="mx-auto h-12 w-12 text-stone-400" />
          <h3 className="mt-3 text-base font-semibold text-stone-900 dark:text-white">
            No conversations yet
          </h3>
          <p className="mt-1 text-xs text-stone-500 max-w-sm mx-auto">
            Place a test call or launch a campaign — recordings and transcripts will appear here automatically.
          </p>
          <Button
            onClick={() => setIsTestCallOpen(true)}
            variant="gold"
            className="mt-4"
          >
            Place your first call
          </Button>
        </div>
      ) : (
        <CallsTable initialCalls={calls} />
      )}

      <TestCallDialog
        isOpen={isTestCallOpen}
        onClose={() => setIsTestCallOpen(false)}
      />
    </div>
  );
}
