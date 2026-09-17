"use client";

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

interface CallsChartProps {
  data?: { date: string; calls: number; answered: number }[];
}

export function CallsChart({ data = [] }: CallsChartProps) {
  const chartData = data.length > 0 ? data : [
    { date: "Mon", calls: 12, answered: 9 },
    { date: "Tue", calls: 19, answered: 14 },
    { date: "Wed", calls: 24, answered: 20 },
    { date: "Thu", calls: 35, answered: 28 },
    { date: "Fri", calls: 42, answered: 34 },
    { date: "Sat", calls: 15, answered: 11 },
    { date: "Sun", calls: 8, answered: 6 },
  ];

  return (
    <Card className="border-slate-200/80 dark:border-slate-800 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-indigo-600" />
            Outbound Volume & Answered Calls
          </CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time telephony engagement metrics over the last 7 days
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
            <span className="text-slate-600 dark:text-slate-400">Total Dialed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-400">Answered</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAnswered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderRadius: "8px",
                  border: "none",
                  color: "#fff",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="calls"
                stroke="#4f46e5"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCalls)"
                name="Total Calls"
              />
              <Area
                type="monotone"
                dataKey="answered"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAnswered)"
                name="Answered"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
