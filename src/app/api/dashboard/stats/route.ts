import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { CallRepository } from "@sigulon/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await getOrgContext();


    const stats = await CallRepository.getDashboardStats(orgId);

    return NextResponse.json({
      stats: {
        total_calls: stats.totalCalls,
        answered_calls: stats.answeredCalls,
        answer_rate_percentage: stats.answerRatePercentage,
        avg_duration_seconds: stats.avgDurationSeconds,
        total_credits_spent: stats.totalCreditsSpent,
        chart_data: stats.chartData,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
