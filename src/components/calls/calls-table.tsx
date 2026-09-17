"use client";

import { useState } from "react";
import { CallRecord } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration, formatPhoneNumber } from "@/lib/utils";
import {
  PhoneCall,
  Search,
  ChevronRight,
  Clock,
  Coins,
  Bot,
  Play,
} from "lucide-react";
import { CallDetailSheet } from "./call-detail-sheet";

interface CallsTableProps {
  initialCalls: CallRecord[];
  operationDirection?: "all" | "inbound" | "outbound";
  operationPeriod?: "today" | "7d" | "30d";
}

export function CallsTable({
  initialCalls,
  operationDirection = "all",
  operationPeriod = "7d",
}: CallsTableProps) {
  const calls = initialCalls;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  const filteredCalls = calls.filter((call) => {
    const callIdentifier =
      call.provider_call_id || call.cartesia_call_id || call.id || "";
    const matchesSearch =
      !search ||
      call.to_number?.includes(search) ||
      call.from_number?.includes(search) ||
      callIdentifier.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "all" || call.status === statusFilter;
    const matchesOutcome = outcomeFilter === "all" || call.outcome === outcomeFilter;
    const matchesDirection = operationDirection === "all" || call.direction === operationDirection;
    const matchesPeriod = isCallWithinPeriod(call.created_at, operationPeriod);

    return matchesSearch && matchesStatus && matchesOutcome && matchesDirection && matchesPeriod;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "in_progress":
        return <Badge variant="warning">In Progress</Badge>;
      case "ringing":
      case "queued":
        return <Badge variant="default">{status.toUpperCase()}</Badge>;
      case "no_answer":
        return <Badge variant="secondary">No Answer</Badge>;
      default:
        return <Badge variant="destructive">{status}</Badge>;
    }
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return <span className="text-slate-400 text-xs">—</span>;
    switch (outcome) {
      case "interested":
        return <Badge variant="success">Interested</Badge>;
      case "callback_requested":
        return <Badge variant="warning">Callback Req</Badge>;
      case "not_interested":
        return <Badge variant="destructive">Not Interested</Badge>;
      case "voicemail":
        return <Badge variant="secondary">Voicemail</Badge>;
      default:
        return <Badge variant="outline">{outcome}</Badge>;
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search phone or call ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Call Statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="no_answer">No Answer</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Outcomes</option>
              <option value="interested">Interested</option>
              <option value="callback_requested">Callback Requested</option>
              <option value="not_interested">Not Interested</option>
              <option value="voicemail">Voicemail</option>
            </select>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Agent</th>
                  <th className="px-5 py-3.5">Direction</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Outcome</th>
                  <th className="px-5 py-3.5">Cost</th>
                  <th className="px-5 py-3.5 text-right">Playback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                      No calls found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredCalls.map((call) => (
                    <tr
                      key={call.id}
                      onClick={() => setSelectedCall(call)}
                      className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {call.created_at ? new Date(call.created_at).toLocaleString() : "Just now"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-900 dark:text-white flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-indigo-500" />
                        {call.agent?.name || "AI Voice Agent"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap capitalize text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <PhoneCall className="h-3 w-3 text-indigo-400" />
                          {call.direction}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono font-medium text-slate-800 dark:text-slate-200">
                        {formatPhoneNumber(call.to_number || "Unknown")}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">{getStatusBadge(call.status)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">{getOutcomeBadge(call.outcome)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Coins className="h-3 w-3 text-amber-500" />
                        {call.cost_credits || 0.25} cr
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                        >
                          <Play className="h-3 w-3" />
                          <span>Inspect</span>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CallDetailSheet
        call={selectedCall}
        isOpen={Boolean(selectedCall)}
        onClose={() => setSelectedCall(null)}
      />
    </>
  );
}

function isCallWithinPeriod(
  createdAt: string | null | undefined,
  period: "today" | "7d" | "30d"
) {
  if (!createdAt) return true;

  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return true;

  const now = new Date();
  if (period === "today") {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return timestamp >= today.getTime();
  }

  const days = period === "30d" ? 30 : 7;
  return timestamp >= now.getTime() - days * 24 * 60 * 60 * 1000;
}
