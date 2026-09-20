"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  CheckCircle2,
  Zap,
} from "lucide-react";

interface LedgerEntry {
  id: string;
  created_at: string;
  event: string;
  label: string;
  amount: number;
  call_id: string | null;
}

interface BillingSummary {
  balance: number;
  reserved: number;
  available: number;
  rate_per_minute: number;
  spend_7d: number;
  recent: LedgerEntry[];
}

const PACKAGES = [
  {
    id: "starter",
    name: "Starter Pack",
    price: "$49",
    credits: 250,
    description: "Great for testing new calling scripts and initial outreach.",
  },
  {
    id: "growth",
    name: "Growth Tier",
    price: "$149",
    credits: 850,
    description: "High concurrency dialing for recurring appointments & sales.",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Scale Volume",
    price: "$499",
    credits: 3200,
    description: "Dedicated telephony lines, priority queues, and SLA.",
  },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/summary");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load billing");
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load billing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const minutes = summary ? Math.floor(summary.available / (summary.rate_per_minute || 0.25)) : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-violet-600" />
          Billing & Voice Credits
        </h1>
        <p className="text-xs text-stone-500 mt-1">
          Live ledger balance, held call estimates, and recent credit activity.
        </p>
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30">
          <CardContent className="p-4 text-xs text-rose-700 dark:text-rose-300">
            Couldn&apos;t load billing data: {error}
          </CardContent>
        </Card>
      )}

      {/* Current Balance Card */}
      <Card className="border-violet-100 bg-gradient-to-br from-violet-50/60 to-white dark:border-violet-900/40 dark:bg-stone-900 shadow-[0_8px_30px_rgba(30,20,60,0.08)]">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                Available Voice Balance
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-stone-900 dark:text-white">
                  {summary ? summary.available.toFixed(2) : "—"}
                </span>
                <span className="text-sm font-semibold text-stone-500">Credits</span>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                {summary ? (
                  <>
                    Balance {summary.balance.toFixed(2)}
                    {" · "}held on live calls {summary.reserved.toFixed(2)}
                    {" · "}≈ <strong>{minutes} minutes</strong> at{" "}
                    {summary.rate_per_minute.toFixed(2)} cr/min
                    {" · "}spent last 7 days {summary.spend_7d.toFixed(2)}
                  </>
                ) : (
                  "Loading live balance…"
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="success" className="px-3 py-1 text-xs">
                Ledger-backed
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Packs (informational — purchases are operator-handled) */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-stone-900 dark:text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Recharge Credit Packages
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PACKAGES.map((pkg) => (
            <Card
              key={pkg.id}
              className={`relative flex flex-col justify-between transition-all ${
                pkg.popular
                  ? "border-violet-500 shadow-md ring-2 ring-violet-500/20"
                  : "border-stone-200 dark:border-stone-800"
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#C9952B] px-3 py-0.5 text-[10px] font-bold text-white tracking-wide">
                  Most Popular
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-base">{pkg.name}</CardTitle>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-stone-900 dark:text-white">
                    {pkg.price}
                  </span>
                  <span className="text-xs text-stone-400">one-time</span>
                </div>
                <p className="text-xs text-stone-500 mt-1">{pkg.description}</p>
              </CardHeader>

              <CardContent className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>{pkg.credits} Calling Credits</strong>
                  </span>
                </div>
              </CardContent>

              <CardFooter className="pt-2 flex-col items-stretch gap-1">
                <Button disabled className="w-full text-xs font-semibold">
                  Contact sales to recharge
                </Button>
                <span className="text-[10px] text-stone-400 text-center">
                  Self-serve checkout lands with billing automation.
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* Ledger History */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-stone-900 dark:text-white">
          Recent Credit Activity
        </h2>
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50 p-2 font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-900">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Description</th>
                <th className="p-3">Call</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {!summary && (
                <tr>
                  <td colSpan={4} className="p-3 text-stone-500">
                    Loading…
                  </td>
                </tr>
              )}
              {summary && summary.recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-stone-500">
                    No credit activity yet — answered calls hold an estimate here,
                    settled on completion.
                  </td>
                </tr>
              )}
              {(summary?.recent ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td className="p-3 text-stone-500">{formatDate(entry.created_at)}</td>
                  <td className="p-3 font-medium text-stone-800 dark:text-stone-200">
                    {entry.label}
                  </td>
                  <td className="p-3 font-mono text-[10px] text-stone-500">
                    {entry.call_id ? entry.call_id.slice(0, 8) : "—"}
                  </td>
                  <td
                    className={`p-3 text-right font-semibold ${
                      entry.amount < 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {entry.amount < 0 ? "−" : "+"}
                    {Math.abs(entry.amount).toFixed(2)} cr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
