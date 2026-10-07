"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PhoneCall } from "lucide-react";

interface ChartPoint {
  day: string;
  calls: number;
  connected: number;
  qualified: number;
}

export function CallActivityChart() {
  const [period, setPeriod] = useState<"today" | "7d" | "30d">("7d");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChartData() {
      try {
        const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        const rawChart: any[] = data.stats?.chart_data || [];

        const points: ChartPoint[] = rawChart.map((item) => ({
          day: item.date,
          calls: item.calls ?? 0,
          connected: item.answered ?? item.calls ?? 0,
          qualified: Math.min(item.answered ?? 0, item.calls ?? 0),
        }));

        if (points.length > 0) {
          setChartData(points);
        } else {
          setChartData([
            { day: "Mon", calls: 0, connected: 0, qualified: 0 },
            { day: "Tue", calls: 0, connected: 0, qualified: 0 },
            { day: "Wed", calls: 0, connected: 0, qualified: 0 },
            { day: "Thu", calls: 0, connected: 0, qualified: 0 },
            { day: "Fri", calls: 0, connected: 0, qualified: 0 },
            { day: "Sat", calls: 0, connected: 0, qualified: 0 },
            { day: "Sun", calls: 0, connected: 0, qualified: 0 },
          ]);
        }
      } catch (err) {
        console.error("[call-chart] Error loading stats chart data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadChartData();
  }, []);

  return (
    <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-3">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-blue-600" />
            Call activity
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
            Actual calls and successful connections over time
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-gray-600 dark:text-neutral-400">Total Calls</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-700" />
              <span className="text-gray-600 dark:text-neutral-400">Connected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-gray-600 dark:text-neutral-400">Qualified</span>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-gray-100 dark:bg-neutral-800 rounded-md p-0.5 text-xs font-medium">
            {(["today", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded capitalize transition-colors ${
                  period === p
                    ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-2xs font-semibold"
                    : "text-gray-600 dark:text-neutral-400 hover:text-gray-900"
                }`}
              >
                {p === "today" ? "Today" : p === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-72 w-full pt-2">
          {loading ? (
            <div className="w-full h-full bg-gray-100 dark:bg-neutral-800/50 rounded-lg animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="connGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="qualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderRadius: "6px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#callsGrad)"
                  name="Total Calls"
                />
                <Area
                  type="monotone"
                  dataKey="connected"
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#connGrad)"
                  name="Connected"
                />
                <Area
                  type="monotone"
                  dataKey="qualified"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#qualGrad)"
                  name="Qualified"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
