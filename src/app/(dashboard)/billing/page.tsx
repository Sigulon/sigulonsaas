"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Plus,
  ArrowUpRight,
  Download,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  Coins,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillingTransaction } from "@/lib/types/sigulon";
import { getBillingOverview, getTransactions, addCredits } from "@/lib/api/billing";
import { AddCreditsModal } from "@/components/layout/add-credits-modal";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function BillingPage() {
  const [overview, setOverview] = useState<any>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = async () => {
    const [ov, tx] = await Promise.all([getBillingOverview(), getTransactions()]);
    setOverview(ov);
    setTransactions(tx);
  };

  useEffect(() => {
    loadData();
  }, []);

  if (!overview) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Loading billing details...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Billing & usage
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
            Transparent pay-as-you-go credit ledger. Top up wallet and download tax invoices.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add credits</span>
        </Button>
      </div>

      {/* Balance & Monthly Usage Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Main Balance Card */}
        <Card className="p-5 bg-gradient-to-br from-blue-50/50 to-white dark:from-neutral-900 dark:to-neutral-850 border-blue-200/80 dark:border-blue-900/40 md:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-neutral-400">
              <span>CURRENT BALANCE</span>
              <Coins className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white mt-2">
              ₹{overview.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              ~{Math.floor(overview.balance / 0.85).toLocaleString()} min talk time remaining
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="w-full mt-4 text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Top up Credits</span>
          </Button>
        </Card>

        {/* Calls Dispatched */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Calls This Month</div>
          <div className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">
            {overview.callsThisMonth.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">Outbound & Inbound total</div>
        </Card>

        {/* Minutes Used */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Minutes Consumed</div>
          <div className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">
            {overview.minutesThisMonth.toLocaleString()} min
          </div>
          <div className="text-[11px] text-gray-500 mt-1">Billed per 60-sec increment</div>
        </Card>

        {/* Effective Rate */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Effective Rate</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            ₹0.85 / min
          </div>
          <div className="text-[11px] text-gray-500 mt-1">Includes STT, LLM & Cartesia TTS</div>
        </Card>
      </div>

      {/* Usage Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-semibold">Daily Credit Spend (₹)</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">Daily voice usage breakdown for October</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.dailyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip
                  formatter={(val: any) => [`₹${val}`, "Spend"]}
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderRadius: "6px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Transaction Ledger</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Immutable billing events and automated deductions.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                  <th className="py-2.5 px-4 font-mono">Date</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 font-mono">Calls</th>
                  <th className="py-2.5 px-3 font-mono">Minutes</th>
                  <th className="py-2.5 px-4 font-mono">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/70 dark:hover:bg-neutral-800/40">
                    <td className="py-3 px-4 font-mono text-gray-500">{tx.date}</td>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                      {tx.description}
                    </td>
                    <td className="py-3 px-3 capitalize">
                      <Badge variant={tx.type === "top_up" ? "success" : "secondary"}>
                        {tx.type.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-mono text-gray-500">{tx.callsCount ?? "-"}</td>
                    <td className="py-3 px-3 font-mono text-gray-500">
                      {tx.minutesCount ? `${tx.minutesCount} min` : "-"}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                      {tx.type === "top_up" ? "+" : "-"}₹{tx.amountInr.toFixed(2)}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant="success" className="capitalize">
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-blue-600 hover:underline flex items-center gap-1 ml-auto text-[11px]">
                        <Download className="w-3 h-3" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Credits Modal */}
      <AddCreditsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreditsAdded={(newBal) => {
          setOverview((prev: any) => ({ ...prev, balance: newBal }));
          loadData();
        }}
      />
    </div>
  );
}
