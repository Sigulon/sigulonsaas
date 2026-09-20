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
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-violet-600" />
              Call volume & answered calls
            </CardTitle>
            <p className="text-xs text-stone-500 mt-0.5">
              Telephony engagement over the last 7 days
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full flex items-center justify-center text-sm text-stone-500">
            No call activity yet — place or receive a call to see volume here.
          </div>
        </CardContent>
      </Card>
    );
  }
  const chartData = data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-violet-600" />
            Call volume & answered calls
          </CardTitle>
          <p className="text-xs text-stone-500 mt-0.5">
            Telephony engagement over the last 7 days
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            <span className="text-stone-600 dark:text-stone-400">Total dialed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-stone-600 dark:text-stone-400">Answered</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAnswered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#78716c" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#78716c" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e1433",
                  borderRadius: "12px",
                  border: "none",
                  color: "#fff",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="calls"
                stroke="#7c3aed"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCalls)"
                name="Total calls"
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
