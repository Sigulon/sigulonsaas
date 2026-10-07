"use client";

import Link from "next/link";
import { PlusCircle, Zap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardHero() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 sm:p-7 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Left Welcome */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Good afternoon, Praveen
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Your AI agents are ready to handle outbound campaigns and inbound calls.
          </p>

          {/* Operational live status indicator */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              All systems operational
            </span>
            <span className="text-gray-300 dark:text-neutral-700">·</span>
            <span className="text-gray-600 dark:text-neutral-400">3 agents ready</span>
            <span className="text-gray-300 dark:text-neutral-700">·</span>
            <span className="text-gray-600 dark:text-neutral-400">0 active calls</span>
            <span className="text-gray-300 dark:text-neutral-700">·</span>
            <span className="text-gray-600 dark:text-neutral-400">14 leads waiting</span>
          </div>
        </div>

        {/* Right Primary Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/calling/instant">
            <Button variant="outline" size="sm" className="gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span>Start instant call</span>
            </Button>
          </Link>
          <Link href="/agents/new">
            <Button variant="primary" size="sm" className="gap-2">
              <PlusCircle className="w-4 h-4" />
              <span>Create agent</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
