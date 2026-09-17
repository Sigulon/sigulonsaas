"use client";

import { VoiceAgentGenerator } from "@/components/builder/voice-agent-generator";
import { Sparkles, ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";

export default function AgentBuilderPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/agents"
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 mb-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Voice Agents
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-600" />
            Voice Agent Generator
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Describe your business naturally. Sigulon designs the conversational flow, variables, prompts, and safeguards for you.
          </p>
        </div>

        <Link
          href="/agents"
          className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
        >
          <Bot className="h-4 w-4" />
          View All Deployed Agents
        </Link>
      </div>

      <VoiceAgentGenerator />
    </div>
  );
}
