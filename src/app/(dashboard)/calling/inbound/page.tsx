"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  PhoneIncoming,
  Radio,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Clock,
  CheckCircle2,
  Settings,
  Headphones,
  FileText,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCalls } from "@/lib/api/calls";
import { getPhoneNumbers } from "@/lib/api/phone-numbers";
import { Call, PhoneNumber } from "@/lib/types/sigulon";

export default function InboundCallsPage() {
  const [activeCallSimulated, setActiveCallSimulated] = useState(false);
  const [activeDuration, setActiveDuration] = useState(0);
  const [inboundCalls, setInboundCalls] = useState<Call[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [calls, numbers] = await Promise.all([
          getCalls({ direction: "inbound" }),
          getPhoneNumbers(),
        ]);
        setInboundCalls(calls);
        setPhoneNumbers(numbers);
      } catch (err) {
        console.error("[inbound] Error loading inbound data:", err);
      }
    }
    loadData();
  }, []);

  const totalInbound = inboundCalls.length;
  const totalDuration = inboundCalls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);
  const avgDurationSec = totalInbound > 0 ? Math.round(totalDuration / totalInbound) : 0;
  const avgDurationFormatted = `${Math.floor(avgDurationSec / 60).toString().padStart(2, "0")}:${(avgDurationSec % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Inbound Calls
        </h1>
        <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
          Live monitoring and routing configuration for customer calls answered by Sigulon agents.
        </p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-gray-400">Active Inbound Calls</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {activeCallSimulated ? "1 Live" : "0"}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">answered within 250ms</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-gray-400">Total Inbound Calls</div>
          <div className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">
            {totalInbound}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">100% pickup rate</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-gray-400">Missed Calls</div>
          <div className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">
            0
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">zero dropped calls</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-gray-400">Average Duration</div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
            {avgDurationFormatted}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">talk time per inquiry</div>
        </Card>
      </div>

      {/* Active Call Live Banner */}
      {activeCallSimulated && (
        <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <PhoneIncoming className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="animate-pulse">
                    ● Live Inbound Call
                  </Badge>
                  <span className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
                    02:14
                  </span>
                </div>
                <div className="text-xs text-gray-700 dark:text-neutral-300 mt-1">
                  Caller: <span className="font-mono font-bold">+91 97012 44551</span> · Agent:{" "}
                  <span className="font-semibold text-blue-600">Harika</span> (Luxury Villa Inquiries)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/talk">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Listen In</span>
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <PhoneForwarded className="w-3.5 h-3.5 text-blue-600" />
                <span>Transfer to Human</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setActiveCallSimulated(false)}
                className="gap-1.5 text-xs"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End Call</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inbound Routing Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Inbound DID Routing Rules</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Map virtual phone numbers to AI agent responders and business hour policies.
            </p>
          </div>
          <Link href="/phone-numbers">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Settings className="w-3.5 h-3.5" />
              <span>Manage Numbers</span>
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                  <th className="py-2.5 px-4 font-mono">Inbound Line</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Assigned AI Agent</th>
                  <th className="py-2.5 px-4">Operating Hours</th>
                  <th className="py-2.5 px-4">Fallback Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {phoneNumbers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No inbound phone numbers registered yet.
                    </td>
                  </tr>
                ) : (
                  phoneNumbers.map((num) => (
                    <tr key={num.id} className="hover:bg-gray-50/60 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                        {num.number}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-neutral-300">{num.city}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {num.assignedAgentName || "Unassigned"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500">24/7 Always Active</td>
                      <td className="py-3 px-4 text-gray-500">Forward to Owner Mobile</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Inbound Call Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent Inbound Call Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                  <th className="py-2.5 px-4">Caller</th>
                  <th className="py-2.5 px-4">Virtual Line</th>
                  <th className="py-2.5 px-4">Agent</th>
                  <th className="py-2.5 px-4 font-mono">Duration</th>
                  <th className="py-2.5 px-4">Outcome</th>
                  <th className="py-2.5 px-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {inboundCalls.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/60 dark:hover:bg-neutral-800/40">
                    <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                      {c.callerNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-500">{c.calleeNumber}</td>
                    <td className="py-3 px-4 font-semibold text-blue-600">{c.agentName}</td>
                    <td className="py-3 px-4 font-mono">
                      {Math.floor(c.durationSeconds / 60)}m {c.durationSeconds % 60}s
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="success" className="capitalize">
                        {c.outcome}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {c.createdAt.replace("T", " ").substring(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
