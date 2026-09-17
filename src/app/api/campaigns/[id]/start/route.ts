import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import {
  CampaignRepository,
  AgentRepository,
  PhoneNumberRepository,
  CampaignContactModel,
  DncEntryModel,
} from "@sigulon/database";
import {
  acquireDispatchLock,
  enqueueDialJobs,
  releaseDispatchLock,
  type DialJob,
} from "@/lib/campaign-queue";
import { getPlivoCredentialsForOrg } from "@/lib/plivo-credentials";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let campaignId = "";
  let lockHeld = false;
  const requestStartedAt = performance.now();
  try {
    ({ id: campaignId } = await params);
    const { orgId } = await getOrgContext();

    let campaign = await CampaignRepository.findById(campaignId, orgId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status === "completed") {
      return NextResponse.json(
        { error: "Campaign is already completed" },
        { status: 400 }
      );
    }
    if (campaign.status === "running") {
      return NextResponse.json(
        { error: "Campaign is already running" },
        { status: 409 }
      );
    }

    // Claim an exclusive dispatcher before moving any contacts from pending
    // to queued. Without it two simultaneous /start requests can enqueue the
    // same contact twice.
    lockHeld = await acquireDispatchLock(campaignId, 300);
    if (!lockHeld) {
      return NextResponse.json(
        { error: "Campaign start is already in progress" },
        { status: 409 }
      );
    }

    // Re-read after acquiring the lock so a start that completed while this
    // request was waiting cannot dispatch stale work.
    campaign = await CampaignRepository.findById(campaignId, orgId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.status === "completed") {
      return NextResponse.json(
        { error: "Campaign is already completed" },
        { status: 400 }
      );
    }
    if (campaign.status === "running") {
      return NextResponse.json(
        { error: "Campaign is already running" },
        { status: 409 }
      );
    }

    // These validations are independent once the campaign is resolved.
    const [agent, outboundNumber, plivoCredentials] = await Promise.all([
      AgentRepository.findById(campaign.agentId, orgId),
      PhoneNumberRepository.getOutboundNumber(orgId),
      getPlivoCredentialsForOrg(orgId).catch((err) => {
        console.error("[campaign/start] unable to load Plivo credentials:", err);
        return null;
      }),
    ]);

    // Agent validation
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Outbound phone number validation
    if (!outboundNumber) {
      return NextResponse.json(
        { error: "No active outbound phone number configured for this workspace." },
        { status: 422 }
      );
    }

    // Fail before marking contacts queued when neither this workspace's BYOC
    // record nor the platform fallback can create Plivo calls.
    if (!plivoCredentials) {
      return NextResponse.json(
        { error: "No usable Plivo credentials are configured for this workspace." },
        { status: 422 }
      );
    }

    // Fetch pending campaign contacts
    const pendingContacts = await CampaignContactModel.find({
      campaignId: campaign._id,
      callStatus: "pending",
    })
      .populate<{ contactId: { _id: { toString(): string }; normalizedPhone: string; doNotCall: boolean } }>(
        "contactId"
      )
      .limit(500)
      .exec();

    const normalizedPhones = pendingContacts
      .map((cc) => cc.contactId?.normalizedPhone)
      .filter((phone): phone is string => Boolean(phone));
    const dncRows = normalizedPhones.length
      ? await DncEntryModel.find({
          organizationId: orgId,
          normalizedPhone: { $in: normalizedPhones },
        })
          .select("normalizedPhone")
          .lean()
          .exec()
      : [];
    const dncNumbers = new Set(dncRows.map((row) => row.normalizedPhone));

    const jobsToEnqueue: DialJob[] = [];
    const claimedContactIds: string[] = [];
    const skippedContactIds: typeof campaign._id[] = [];
    const dncContactIds: typeof campaign._id[] = [];
    let dncCount = 0;
    let skippedCount = 0;
    let queuedCount = 0;

    for (const cc of pendingContacts) {
      const contact = cc.contactId;
      if (!contact || !contact.normalizedPhone) {
        skippedContactIds.push(cc._id);
        skippedCount++;
        continue;
      }

      // Pre-dial DNC verification
      const isDnc = contact.doNotCall || dncNumbers.has(contact.normalizedPhone);

      if (isDnc) {
        dncContactIds.push(cc._id);
        dncCount++;
        continue;
      }

      claimedContactIds.push(cc._id.toString());
      queuedCount++;

      jobsToEnqueue.push({
        campaign_id: campaign._id.toString(),
        contact_id: contact._id.toString(),
        org_id: orgId,
        agent_id: agent._id.toString(),
        normalized_phone: contact.normalizedPhone,
        caller_number: outboundNumber.phoneNumber,
        // `attempt` is the number of completed dial attempts. The worker
        // increments it after a dial; starting at one skips a permitted try.
        attempt: cc.attemptCount || 0,
        max_attempts: campaign.retryConfig?.maxAttempts ?? 3,
      });
    }

    // One DNC query plus at most three bulk writes replaces per-contact
    // reads/writes, keeping a 500-contact batch inside a small fixed number
    // of MongoDB round trips. The Redis lock still serializes dispatch.
    await Promise.all([
      skippedContactIds.length
        ? CampaignContactModel.updateMany(
            { _id: { $in: skippedContactIds }, callStatus: "pending" },
            { $set: { callStatus: "skipped" } }
          ).exec()
        : Promise.resolve(),
      dncContactIds.length
        ? CampaignContactModel.updateMany(
            { _id: { $in: dncContactIds }, callStatus: "pending" },
            { $set: { callStatus: "dnc" } }
          ).exec()
        : Promise.resolve(),
      claimedContactIds.length
        ? CampaignContactModel.updateMany(
            { _id: { $in: claimedContactIds }, callStatus: "pending" },
            { $set: { callStatus: "queued" } }
          ).exec()
        : Promise.resolve(),
    ]);

    const previousStatus = campaign.status;

    // The worker only processes running campaigns. Set this before enqueueing
    // but restore the claimed contacts and status if Redis rejects the batch.
    await CampaignRepository.updateStatus(campaign._id, orgId, "running");

    try {
      if (jobsToEnqueue.length > 0) {
        await enqueueDialJobs(jobsToEnqueue);
      }
    } catch (err) {
      await Promise.all([
        CampaignRepository.updateStatus(campaign._id, orgId, previousStatus),
        CampaignContactModel.updateMany(
          { _id: { $in: claimedContactIds }, callStatus: "queued" },
          { $set: { callStatus: "pending" } }
        ).exec(),
      ]);
      console.error("[campaign/start] failed to enqueue dial jobs:", err);
      return NextResponse.json(
        { error: "Dial queue is unavailable. No contacts were dispatched." },
        { status: 503 }
      );
    }

    // A campaign containing only DNC/invalid contacts has no worker job to
    // trigger completion; finish it immediately once all rows are terminal.
    if (jobsToEnqueue.length === 0) {
      await CampaignRepository.checkAndMarkCompletion(campaign._id);
    }

    console.info(JSON.stringify({
      event: "api_latency",
      route: "/api/campaigns/:id/start",
      stage: "response_ready",
      durationMs: Math.round(performance.now() - requestStartedAt),
      campaignId,
      queued: queuedCount,
    }));

    return NextResponse.json({
      campaign_id: campaign._id.toString(),
      status: "running",
      queued: queuedCount,
      dnc: dncCount,
      skipped: skippedCount,
      total_enqueued: jobsToEnqueue.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  } finally {
    if (lockHeld && campaignId) {
      await releaseDispatchLock(campaignId);
    }
  }
}
