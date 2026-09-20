"use client";

import { Sheet } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { CallRecord } from "@/lib/types";
import { formatDuration, formatPhoneNumber } from "@/lib/utils";
import {
  PhoneCall,
  Clock,
  Coins,
  Bot,
  User,
  Volume2,
  Calendar,
  AlertCircle,
} from "lucide-react";

interface CallDetailSheetProps {
  call: CallRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CallDetailSheet({ call, isOpen, onClose }: CallDetailSheetProps) {
  if (!call) return null;

  const outcomeVariants: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
    interested: "success",
    callback_requested: "warning",
    not_interested: "destructive",
    voicemail: "secondary",
  };

  const statusVariants: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
    completed: "success",
    in_progress: "warning",
    failed: "destructive",
    no_answer: "secondary",
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Call Details & Transcript"
      description={`Call ID: ${call.provider_call_id || call.cartesia_call_id || call.id}`}
    >
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
            <span className="text-[11px] font-medium text-stone-400 block">Status</span>
            <div className="mt-1">
              <Badge variant={statusVariants[call.status] || "secondary"}>
                {call.status.toUpperCase()}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
            <span className="text-[11px] font-medium text-stone-400 block">Outcome</span>
            <div className="mt-1">
              <Badge variant={outcomeVariants[call.outcome || ""] || "secondary"}>
                {call.outcome ? call.outcome.replace("_", " ").toUpperCase() : "NO DISPOSITION"}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
            <span className="text-[11px] font-medium text-stone-400 block">Duration</span>
            <div className="mt-1 font-semibold text-sm text-stone-900 dark:text-white flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-stone-400" />
              {formatDuration(call.duration_seconds)}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
            <span className="text-[11px] font-medium text-stone-400 block">Cost</span>
            <div className="mt-1 font-semibold text-sm text-stone-900 dark:text-white flex items-center gap-1">
              <Coins className="h-3.5 w-3.5 text-amber-500" />
              {call.cost_credits || 0.25} cr
            </div>
          </div>
        </div>

        {/* Telephony Metadata */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950 space-y-3">
          <h4 className="text-xs font-semibold text-stone-900 dark:text-white uppercase tracking-wider">
            Telephony Information
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-stone-400 block">From (Agent Line):</span>
              <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
                {formatPhoneNumber(call.from_number || "—")}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">To (Recipient):</span>
              <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
                {formatPhoneNumber(call.to_number || "Unknown")}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">Started At:</span>
              <span className="text-stone-700 dark:text-stone-300 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                {call.started_at ? new Date(call.started_at).toLocaleString() : "Pending"}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">Direction:</span>
              <span className="capitalize font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1">
                <PhoneCall className="h-3.5 w-3.5 text-violet-500" />
                {call.direction}
              </span>
            </div>
          </div>
        </div>

        {/* Call Audio Recording Playback */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-stone-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="h-4 w-4 text-violet-600" />
              Call Audio Recording
            </h4>
            {call.recording_url && (
              <span className="text-[10px] text-emerald-600 font-medium">Call Audio</span>
            )}
          </div>

          {call.recording_url ? (
            <div className="pt-1">
              <audio controls className="w-full h-10 rounded-lg">
                <source src={call.recording_url} type="audio/wav" />
                <source src={call.recording_url} type="audio/mpeg" />
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-stone-50 dark:bg-stone-900 p-3 text-xs text-stone-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Audio recording will appear here once the call completes and is processed.</span>
            </div>
          )}
        </div>

        {/* Transcript Conversation Stream */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-stone-900 dark:text-white uppercase tracking-wider">
              Live Transcript ({call.transcript?.length || 0} turns)
            </h4>
            <span className="text-[11px] text-stone-400">Auto-transcribed by the voice runtime</span>
          </div>

          <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/50 p-4 dark:border-stone-800 dark:bg-stone-900/40 max-h-96 overflow-y-auto">
            {(!call.transcript || call.transcript.length === 0) ? (
              <div className="py-8 text-center text-xs text-stone-400">
                No transcript turns recorded for this call.
              </div>
            ) : (
              call.transcript.map((msg, idx) => {
                const isAgent = msg.role === "agent";
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 ${
                      isAgent ? "flex-row" : "flex-row-reverse"
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isAgent
                          ? "bg-violet-600 text-white"
                          : "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                      }`}
                    >
                      {isAgent ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>

                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isAgent
                          ? "rounded-tl-xs bg-white text-stone-900 border border-stone-200 shadow-2xs dark:bg-stone-950 dark:text-stone-100 dark:border-stone-800"
                          : "rounded-tr-xs bg-violet-600 text-white shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <span
                          className={`font-semibold text-[10px] uppercase ${
                            isAgent ? "text-violet-600 dark:text-violet-400" : "text-violet-200"
                          }`}
                        >
                          {isAgent ? "AI Voice Agent" : "Customer / Callee"}
                        </span>
                        {msg.timestamp && (
                          <span
                            className={`text-[9px] ${
                              isAgent ? "text-stone-400" : "text-violet-200"
                            }`}
                          >
                            {msg.timestamp}
                          </span>
                        )}
                      </div>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
