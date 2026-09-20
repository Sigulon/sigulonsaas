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
  operationPeriod?: "all" | "today" | "7d" | "30d";
}

/** The calls API nests the agent under `voice_agents`; older rows use `agent`. */
type CallWithAgentAlias = CallRecord & {
  voice_agents?: { id?: string; name?: string } | null;
};

function agentNameFor(call: CallRecord): string {
  const aliased = call as CallWithAgentAlias;
  return (
    call.agent?.name || aliased.voice_agents?.name || "AI Voice Agent"
  );
}

export function CallsTable({
  initialCalls,
  operationDirection = "all",
  operationPeriod = "all",
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
    if (!outcome) return <span className="text-stone-400 text-xs">—</span>;
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
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
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
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
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
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
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
        <div className="overflow-hidden rounded-[20px] border border-stone-200/70 bg-white dark:border-stone-800 dark:bg-stone-950 shadow-[0_8px_30px_rgba(30,20,60,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200/70 bg-stone-50/70 text-stone-500 font-semibold dark:border-stone-800 dark:bg-stone-900/50">
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
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-stone-400">
                      No calls found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredCalls.map((call) => (
                    <tr
                      key={call.id}
                      onClick={() => setSelectedCall(call)}
                      className="cursor-pointer hover:bg-stone-50/80 dark:hover:bg-stone-900/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-300">
                        {call.created_at ? new Date(call.created_at).toLocaleString() : "Just now"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-stone-900 dark:text-white flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-violet-500" />
                        {agentNameFor(call)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap capitalize text-stone-600 dark:text-stone-400">
                        <span className="flex items-center gap-1">
                          <PhoneCall className="h-3 w-3 text-violet-400" />
                          {call.direction}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono font-medium text-stone-800 dark:text-stone-200">
                        {formatPhoneNumber(
                          call.direction === "inbound"
                            ? call.from_number || call.to_number || "Unknown"
                            : call.to_number || call.from_number || "Unknown"
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-stone-400" />
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">{getStatusBadge(call.status)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">{getOutcomeBadge(call.outcome)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1">
                        <Coins className="h-3 w-3 text-amber-500" />
                        {call.cost_credits || 0.25} cr
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs flex items-center gap-1 text-violet-600 hover:text-violet-700"
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
  period: "all" | "today" | "7d" | "30d"
) {
  if (period === "all") return true;
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
