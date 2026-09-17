import { NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/auth-helpers";
import {
  AuditLogRepository,
  BillingRepository,
  AgentModel,
  CallModel,
  CampaignModel,
  OrganizationMemberModel,
  connectToDatabase,
} from "@sigulon/database";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getOrgContext();
    requireRole(context, ["owner", "admin"]);

    const { orgId } = context;
    await connectToDatabase();
    const orgObjectId = new mongoose.Types.ObjectId(orgId);

    // Parallel fetch aggregate metrics
    const [
      auditLogs,
      billingState,
      memberCount,
      agentCount,
      campaignCount,
      callStats,
    ] = await Promise.all([
      AuditLogRepository.listByOrg(orgId, 25),
      BillingRepository.getState(orgId),
      OrganizationMemberModel.countDocuments({ organizationId: orgObjectId }),
      AgentModel.countDocuments({ organizationId: orgObjectId }),
      CampaignModel.countDocuments({ organizationId: orgObjectId }),
      CallModel.aggregate([
        { $match: { organizationId: orgObjectId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalDuration: { $sum: "$durationSeconds" },
          },
        },
      ]),
    ]);

    const callsByStatus: Record<string, number> = {};
    let totalCalls = 0;
    let totalSeconds = 0;

    for (const stat of callStats) {
      callsByStatus[stat._id] = stat.count;
      totalCalls += stat.count;
      totalSeconds += stat.totalDuration || 0;
    }

    return NextResponse.json({
      overview: {
        organizationId: orgId,
        creditBalance: billingState.available,
        teamMembers: memberCount,
        agentsCount: agentCount,
        campaignsCount: campaignCount,
        callsCount: totalCalls,
        totalDurationMinutes: Math.round(totalSeconds / 60),
        callsByStatus,
      },
      recentActivity: auditLogs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Access denied";
    const status = msg.includes("Forbidden") || msg.includes("role") ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}
