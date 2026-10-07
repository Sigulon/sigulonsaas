"use client";

import Link from "next/link";
import {
  Phone,
  Radio,
  Copy,
  ExternalLink,
  Pause,
  Play,
  Volume2,
  Globe,
  Tag,
} from "lucide-react";
import { Agent } from "@/lib/types/sigulon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AgentCardProps {
  agent: Agent;
  onDuplicate?: (id: string) => void;
  onToggleStatus?: (id: string) => void;
}

export function AgentCard({ agent, onDuplicate, onToggleStatus }: AgentCardProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-neutral-700 transition-all flex flex-col justify-between group">
      <div>
        {/* Top Header: Avatar + Name + Status */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 font-bold text-base flex items-center justify-center shrink-0">
              {agent.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                  {agent.name}
                </h3>
                <Badge
                  variant={agent.status === "ready" ? "success" : "secondary"}
                  className="capitalize text-[10px]"
                >
                  {agent.status}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                {agent.role}
              </p>
            </div>
          </div>
        </div>

        {/* Tags & Metadata */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4 text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300">
            <Tag className="w-3 h-3 text-gray-400" />
            <span className="capitalize">{agent.channel}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300">
            <Globe className="w-3 h-3 text-gray-400" />
            <span>{agent.language}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
            <Volume2 className="w-3 h-3 text-blue-500" />
            <span>Cartesia Voice</span>
          </span>
        </div>

        {/* Phone number display */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-gray-500 dark:text-neutral-400 mb-4 pb-3.5 border-b border-gray-100 dark:border-neutral-800">
          <Phone className="w-3.5 h-3.5 text-gray-400" />
          <span>{agent.phoneNumber || "No number assigned"}</span>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center bg-gray-50/70 dark:bg-neutral-800/40 rounded-lg p-2.5 mb-4 border border-gray-100 dark:border-neutral-800">
          <div>
            <div className="text-xs text-gray-400 dark:text-neutral-500">Calls today</div>
            <div className="text-sm font-bold font-mono text-gray-900 dark:text-white mt-0.5">
              {agent.callsToday}
            </div>
          </div>
          <div className="border-x border-gray-200 dark:border-neutral-700">
            <div className="text-xs text-gray-400 dark:text-neutral-500">Leads</div>
            <div className="text-sm font-bold font-mono text-gray-900 dark:text-white mt-0.5">
              {agent.leadsCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 dark:text-neutral-500">Qualified</div>
            <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {agent.qualifiedCount}
            </div>
          </div>
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Link href={`/agents/${agent.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full text-xs">
            Open
          </Button>
        </Link>

        <Link href={`/talk?agent=${agent.id}`}>
          <Button variant="subtle" size="sm" className="text-xs gap-1" title="Test talk">
            <Radio className="w-3.5 h-3.5" />
            <span>Talk</span>
          </Button>
        </Link>

        {onDuplicate && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDuplicate(agent.id)}
            title="Duplicate agent"
            aria-label={`Duplicate ${agent.name}`}
          >
            <Copy className="w-3.5 h-3.5 text-gray-500" />
          </Button>
        )}

        {onToggleStatus && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleStatus(agent.id)}
            title={agent.status === "ready" ? "Pause agent" : "Resume agent"}
            aria-label={agent.status === "ready" ? `Pause ${agent.name}` : `Resume ${agent.name}`}
          >
            {agent.status === "ready" ? (
              <Pause className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Play className="w-3.5 h-3.5 text-emerald-600" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
