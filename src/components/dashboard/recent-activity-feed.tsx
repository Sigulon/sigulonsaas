"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PhoneCall,
  UserCheck,
  Megaphone,
  PhoneIncoming,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface ActivityItem {
  id: string;
  type: "call_completed" | "lead_qualified" | "campaign_started" | "inbound_call";
  title: string;
  detail: string;
  time: string;
  targetUrl: string;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "Recently";
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function RecentActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecentCalls() {
      try {
        const res = await fetch("/api/calls?limit=6", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        const calls: any[] = data.calls || [];

        const items: ActivityItem[] = calls.map((c) => {
          const agentName = c.voice_agents?.name || c.to_number || "Voice Agent";
          const duration = c.duration_seconds
            ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s`
            : "0s";
          const caller = c.from_number || "Web Simulator";

          return {
            id: c.id,
            type: "call_completed",
            title: `Call ${c.status || "completed"}`,
            detail: `${caller} · ${agentName} (${duration})`,
            time: formatRelativeTime(c.created_at || c.ended_at),
            targetUrl: "/calls",
          };
        });

        setActivities(items);
      } catch (err) {
        console.error("[recent-activity] Error loading calls:", err);
      } finally {
        setLoading(false);
      }
    }

    loadRecentCalls();
  }, []);

  const getIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "call_completed":
        return <PhoneCall className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
      case "lead_qualified":
        return <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case "campaign_started":
        return <Megaphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
      case "inbound_call":
        return <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    }
  };

  const getBg = (type: ActivityItem["type"]) => {
    switch (type) {
      case "lead_qualified":
      case "inbound_call":
        return "bg-emerald-50 dark:bg-emerald-950/60";
      default:
        return "bg-blue-50 dark:bg-blue-950/60";
    }
  };

  return (
    <Card className="border-gray-200 dark:border-neutral-800 shadow-xs h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
            Recent activity
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
            Real-time feed of actual voice calls and sessions
          </p>
        </div>
        <Link
          href="/calls"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 group"
        >
          <span>All logs</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </CardHeader>

      <CardContent className="pt-1">
        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-10 bg-gray-100 dark:bg-neutral-800/60 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500 dark:text-neutral-400">
            No call activity recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((act) => (
              <Link
                key={act.id}
                href={act.targetUrl}
                className="flex items-start justify-between p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${getBg(
                      act.type
                    )}`}
                  >
                    {getIcon(act.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {act.title}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-neutral-400 font-mono truncate mt-0.5">
                      {act.detail}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 dark:text-neutral-500 shrink-0 ml-2 mt-0.5">
                  {act.time}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
