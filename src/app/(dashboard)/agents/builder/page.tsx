"use client";

import { VoiceAgentGenerator } from "@/components/builder/voice-agent-generator";
import { Sparkles, ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";

export default function AgentBuilderPage() {
  return (
    <div className="space-y-6">
      {/* Plum hero */}
      <section className="overflow-hidden rounded-[20px] bg-[#1E1433] p-6 text-white sm:p-8">
        <Link
          href="/agents"
          className="text-xs text-violet-200 hover:text-white flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to your team
        </Link>
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-content-center rounded-full bg-violet-600">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Voice Agent Generator
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-violet-100/80">
              Describe your business naturally. Sigulon designs the conversational flow, variables, prompts, and safeguards for you.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {["Hindi", "Telugu", "Tamil", "Indian English"].map((language) => (
            <span key={language} className="rounded-full bg-white/10 px-3 py-1 text-xs text-violet-100">
              {language}
            </span>
          ))}
          <Link
            href="/agents"
            className="ml-auto text-xs font-semibold text-violet-200 hover:text-white flex items-center gap-1"
          >
            <Bot className="h-4 w-4" />
            View deployed agents
          </Link>
        </div>
      </section>

      <VoiceAgentGenerator />
    </div>
  );
}
