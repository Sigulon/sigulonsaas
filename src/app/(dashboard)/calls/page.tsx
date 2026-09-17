"use client";

import { useEffect, useState, useCallback } from "react";
import { CallsTable } from "@/components/calls/calls-table";
import { CallRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { TestCallDialog } from "@/components/agents/test-call-dialog";
import { PhoneCall, RefreshCw, Loader2 } from "lucide-react";

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-indigo-600" />
            Call Logs & Transcripts
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse call dispositions, listen to audio recordings, and inspect turn-by-turn AI transcripts.
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Test Dial
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
          <span className="text-sm">Fetching call records...</span>
        </div>
      ) : calls.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
          <PhoneCall className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
            No Calls Recorded Yet
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Dispatched calls and incoming webhook events will automatically record recordings and transcripts here.
          </p>
          <Button
            onClick={() => setIsTestCallOpen(true)}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700"
          >
            Initiate First Call
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
