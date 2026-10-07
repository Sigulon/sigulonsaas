import { BillingTransaction } from "../types/sigulon";

export async function getBillingOverview() {
  try {
    const [billingRes, statsRes] = await Promise.all([
      fetch("/api/billing/summary", { cache: "no-store" }),
      fetch("/api/dashboard/stats", { cache: "no-store" }),
    ]);

    const billingData = billingRes.ok ? await billingRes.json() : {};
    const statsData = statsRes.ok ? await statsRes.json() : {};
    const stats = statsData.stats || {};

    const chartData = stats.chart_data || [];
    const dailyUsage = chartData.map((d: any) => ({
      day: d.date,
      calls: d.calls,
      minutes: Math.round((d.calls * (stats.avg_duration_seconds || 60)) / 60),
      spend: d.calls * (billingData.rate_per_minute || 1),
    }));

    return {
      balance: billingData.balance ?? 50,
      reserved: billingData.reserved ?? 0,
      available: billingData.available ?? 50,
      autoRecharge: false,
      rechargeThreshold: 10,
      rechargeAmount: 100,
      callsThisMonth: stats.total_calls ?? 0,
      minutesThisMonth: Math.round(((stats.total_calls ?? 0) * (stats.avg_duration_seconds ?? 60)) / 60),
      spendThisMonth: stats.total_credits_spent ?? 0,
      effectiveRate: billingData.rate_per_minute ?? 1.0,
      dailyUsage: dailyUsage.length > 0 ? dailyUsage : [
        { day: "Mon", calls: 0, minutes: 0, spend: 0 },
        { day: "Tue", calls: 0, minutes: 0, spend: 0 },
        { day: "Wed", calls: 0, minutes: 0, spend: 0 },
        { day: "Thu", calls: 0, minutes: 0, spend: 0 },
        { day: "Fri", calls: 0, minutes: 0, spend: 0 },
        { day: "Sat", calls: 0, minutes: 0, spend: 0 },
        { day: "Sun", calls: 0, minutes: 0, spend: 0 },
      ],
    };
  } catch (err) {
    console.error("[api/billing] getBillingOverview error:", err);
    return {
      balance: 50,
      reserved: 0,
      available: 50,
      autoRecharge: false,
      rechargeThreshold: 10,
      rechargeAmount: 100,
      callsThisMonth: 0,
      minutesThisMonth: 0,
      spendThisMonth: 0,
      effectiveRate: 1.0,
      dailyUsage: [],
    };
  }
}

export async function getTransactions(): Promise<BillingTransaction[]> {
  try {
    const res = await fetch("/api/billing/summary", { cache: "no-store" });
    if (!res.ok) return [];

    const data = await res.json();
    const recent: any[] = data.recent || [];

    return recent.map((r: any) => ({
      id: r.id,
      date: r.created_at ? r.created_at.replace("T", " ").substring(0, 16) : new Date().toISOString(),
      description: r.label || r.event || "Transaction",
      type: r.event === "credit_grant" || r.event === "top_up" ? "top_up" : "usage",
      amountInr: r.amount ?? 0,
      status: "completed",
      invoiceId: `INV-${(r.id || "").substring(0, 8).toUpperCase()}`,
    }));
  } catch (err) {
    console.error("[api/billing] getTransactions error:", err);
    return [];
  }
}

export async function addCredits(amount: number): Promise<{ success: boolean; newBalance: number }> {
  // Mock ledger update for client trigger
  return { success: true, newBalance: 50 + amount };
}
