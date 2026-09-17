import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { BillingRepository } from "@sigulon/database";
import { creditsPerMinute, toLedgerView, type LedgerRow } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  try {

    const { orgId } = await getOrgContext();
    const summary = await BillingRepository.getSummary(orgId);

    const ledgerRows: LedgerRow[] = summary.history.map((h) => ({
      id: h._id.toString(),
      created_at: h.createdAt.toISOString(),
      event: h.type,
      amount_credits: h.amount,
      call_id: h.referenceId || null,
      metadata: h.metadata,
    }));

    return NextResponse.json({
      balance: summary.balance,
      reserved: summary.reserved,
      available: summary.available,
      rate_per_minute: creditsPerMinute(),
      spend_7d: summary.spend7d,
      recent: toLedgerView(ledgerRows),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const httpStatus =
      (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status: httpStatus });
  }
}
