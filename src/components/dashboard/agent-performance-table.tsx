"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Agent } from "@/lib/types/sigulon";
import { getAgents } from "@/lib/api/agents";

export function AgentPerformanceTable() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getAgents();
        setAgents(data);
      } catch (err) {
        console.error("[agent-performance] Error loading agents:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <Card className="border-gray-200 dark:border-neutral-800 shadow-xs h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
            Agent performance
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
            Key metrics by active voice agent
          </p>
        </div>
        <Link
          href="/agents"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 group"
        >
          <span>View all agents</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 font-medium bg-gray-50/50 dark:bg-neutral-850/50">
                <th className="py-2.5 px-5">Agent</th>
                <th className="py-2.5 px-3 font-mono">Calls</th>
                <th className="py-2.5 px-3 font-mono">Connected</th>
                <th className="py-2.5 px-3 font-mono">Language</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    Loading agent metrics...
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No voice agents configured yet.
                  </td>
                </tr>
              ) : (
                agents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="hover:bg-gray-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-semibold text-xs flex items-center justify-center shrink-0">
                          {agent.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {agent.name}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-neutral-400 truncate max-w-[180px]">
                            {agent.role}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-gray-900 dark:text-white">
                      {agent.totalCalls || agent.callsToday || 0}
                    </td>
                    <td className="py-3 px-3 font-mono text-gray-600 dark:text-neutral-300">
                      {agent.callsToday || 0}
                    </td>
                    <td className="py-3 px-3 font-mono text-gray-600 dark:text-neutral-300">
                      {agent.language}
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={agent.status === "ready" ? "success" : "secondary"}
                        className="capitalize"
                      >
                        {agent.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/agents/${agent.id}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                        title="Open agent profile"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
