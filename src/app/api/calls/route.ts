import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import {
  CallRepository,
  ContactRepository,
  DncRepository,
  AgentRepository,
  PhoneNumberRepository,
} from "@sigulon/database";
import { normalizePhone } from "@/lib/phone";
import { LIVEKIT_AGENT_NAME, buildDispatchMetadata, roomNameForCall } from "@/lib/livekit";

export const dynamic = "force-dynamic";

type PopulatedAgent = {
  _id: { toString(): string };
  name: string;
  config?: { voice?: { voiceId?: string } };
};

type PopulatedContact = {
  _id: { toString(): string };
  name?: string;
  phone?: string;
};

type PopulatedRecording = {
  objectKey?: string;
};

type PopulatedTranscript = {
  segments?: Array<{
    speaker: "agent" | "user" | "system";
    text: string;
    startMs?: number;
  }>;
};

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await getOrgContext();
    const { searchParams } = new URL(req.url);

    const agentId = searchParams.get("agent_id") || undefined;
    const campaignId = searchParams.get("campaign_id") || undefined;
    const status = searchParams.get("status") || undefined;
    const outcome = searchParams.get("outcome") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { calls, total } = await CallRepository.findByOrg(orgId, {
      agentId,
      campaignId,
      status,
      outcome,
      limit,
      offset,
    });

    const formattedCalls = calls.map((c) => ({
      id: c._id.toString(),
      org_id: c.organizationId.toString(),
      agent_id: c.agentId ? c.agentId.toString() : "",
      campaign_id: c.campaignId ? c.campaignId.toString() : null,
      contact_id: c.contactId ? c.contactId.toString() : null,
      provider: c.provider,
      provider_call_id: c.providerCallId || null,
      direction: c.direction,
      status: c.status.toLowerCase(),
      from_number: c.fromNumber || "",
      to_number: c.toNumber,
      started_at: c.startedAt ? c.startedAt.toISOString() : null,
      answered_at: c.answeredAt ? c.answeredAt.toISOString() : null,
      ended_at: c.endedAt ? c.endedAt.toISOString() : null,
      duration_seconds: c.durationSeconds,
      cost_credits: c.costCredits,
      summary: c.summary || "",
      outcome: c.outcome || "",
      recording_url:
        (typeof (c as unknown as { recording?: { url?: string } })?.recording?.url === "string"
          ? (c as unknown as { recording?: { url?: string } }).recording?.url
          : null) ||
        (c.recordingId as unknown as PopulatedRecording)?.objectKey ||
        (typeof c.metadata?.recordingUrl === "string" ? c.metadata.recordingUrl : null) ||
        (typeof c.metadata?.recordUrl === "string" ? c.metadata.recordUrl : null) ||
        null,
      recording: (c as unknown as { recording?: Record<string, unknown> })?.recording || null,
      transcript:
        (c.transcriptId as unknown as PopulatedTranscript)?.segments?.map((s) => ({
          role: s.speaker,
          text: s.text,
          timestamp: s.startMs !== undefined ? `${Math.round(s.startMs / 1000)}s` : undefined,
        })) ||
        (Array.isArray(c.metadata?.transcript)
          ? (c.metadata.transcript as Array<{ role: "agent" | "user" | "system"; text: string; timestamp?: string }>)
          : []) ||
        [],
      metadata: c.metadata,
      voice_agents: c.agentId && typeof c.agentId === "object"
        ? (() => {
            const agent = c.agentId as unknown as PopulatedAgent;
            return {
              id: agent._id?.toString(),
              name: agent.name,
              voice_id: agent.config?.voice?.voiceId,
            };
          })()
        : undefined,
      contacts: c.contactId && typeof c.contactId === "object"
        ? (() => {
            const contact = c.contactId as unknown as PopulatedContact;
            return {
              id: contact._id?.toString(),
              name: contact.name,
              phone: contact.phone,
            };
          })()
        : undefined,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      calls: formattedCalls,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const httpStatus = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status: httpStatus });
  }
}

export async function POST(req: NextRequest) {
  try {
    const requestStartedAt = performance.now();
    const context = await getOrgContext();
    if (!canCreateAndRun(context.role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const { orgId } = context;
    const body = await req.json();
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || "";

    if (idempotencyKey.length > 200) {
      return NextResponse.json(
        { error: "Idempotency-Key must be 200 characters or fewer" },
        { status: 400 }
      );
    }
    if (idempotencyKey) {
      const existing = await CallRepository.findByIdempotencyKey(
        orgId,
        idempotencyKey
      );
      if (existing) {
        return NextResponse.json({
          call: {
            id: existing._id.toString(),
            org_id: existing.organizationId.toString(),
            status: existing.status.toLowerCase(),
            to_number: existing.toNumber,
            from_number: existing.fromNumber || "",
            provider_call_id: existing.providerCallId || null,
            enqueued: !["COMPLETED", "FAILED", "BUSY", "NO_ANSWER", "CANCELLED"].includes(existing.status),
          },
          idempotent: true,
        });
      }
    }

    const {
      agentId,
      toNumber,
      campaignId,
      workflowId,
      customerContext,
      promptInjection,
      voiceId,
      metadata = {},
    } = body;

    if (!agentId || !toNumber) {
      return NextResponse.json(
        { error: "agentId and toNumber are required" },
        { status: 400 }
      );
    }

    const normalized = normalizePhone(toNumber);
    if (!normalized) {
      return NextResponse.json(
        { error: "toNumber is not a parseable phone number" },
        { status: 400 }
      );
    }

    // DNC and contact lookup are independent MongoDB reads.
    const [isDnc, existingContact] = await Promise.all([
      DncRepository.isDnc(orgId, normalized),
      ContactRepository.findByNormalizedPhone(orgId, normalized),
    ]);

    // 1. DNC check
    if (isDnc) {
      return NextResponse.json(
        { error: "Recipient is registered on the Do Not Call (DNC) list." },
        { status: 403 }
      );
    }

    // 2. Check contact DNC flag
    let contact = existingContact;
    if (contact && contact.doNotCall) {
      return NextResponse.json(
        { error: "Recipient is registered on the Do Not Call (DNC) list." },
        { status: 403 }
      );
    }

    // 3. Agent must exist and belong to org
    const agent = await AgentRepository.findById(agentId, orgId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (agent.status !== "active") {
      return NextResponse.json(
        { error: "Agent is not active" },
        { status: 422 }
      );
    }

    // 4. Resolve caller number
    let fromNumber = typeof body.fromNumber === "string" ? body.fromNumber.trim() : "";
    let outboundNumber = null;
    if (fromNumber) {
      outboundNumber = await PhoneNumberRepository.findByNumber(fromNumber);
      if (!outboundNumber || outboundNumber.organizationId.toString() !== orgId) {
        return NextResponse.json(
          { error: "The selected caller ID is not an active phone number in this workspace." },
          { status: 422 }
        );
      }
      if (
        outboundNumber.direction !== "outbound" &&
        outboundNumber.direction !== "both"
      ) {
        return NextResponse.json(
          { error: "The selected caller ID is not enabled for outbound calls." },
          { status: 422 }
        );
      }
      fromNumber = outboundNumber.phoneNumber;
    }
    if (!outboundNumber) {
      outboundNumber = await PhoneNumberRepository.getOutboundNumber(orgId);
    }
    if (!fromNumber) {
      fromNumber = outboundNumber?.phoneNumber || process.env.PLIVO_PHONE_NUMBER?.trim() || "";
    }
    if (!fromNumber) {
      return NextResponse.json(
        { error: "No active outbound caller ID is configured for this workspace." },
        { status: 422 }
      );
    }

    // 5. LiveKit must be configured (outbound dial: room + dispatch + SIP).
    if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      return NextResponse.json(
        { error: "LiveKit is not configured for this workspace. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET." },
        { status: 422 }
      );
    }
    const outboundTrunkId =
      (outboundNumber as unknown as { lkTrunkId?: string })?.lkTrunkId || "";
    if (!outboundTrunkId) {
      return NextResponse.json(
        { error: "The selected caller ID has no LiveKit outbound trunk yet. Re-save the number in Phone Numbers to provision it." },
        { status: 422 }
      );
    }

    // 7. Link or create contact
    if (!contact) {
      contact = await ContactRepository.create({
        organizationId: orgId,
        phone: toNumber,
        normalizedPhone: normalized,
        source: "single-dial",
        customFields: metadata as Record<string, unknown>,
      });
    }

    // 8. Record call in MongoDB (provider livekit; room is the provider leg).
    let call: Awaited<ReturnType<typeof CallRepository.create>>;
    try {
      call = await CallRepository.create({
        organizationId: orgId,
        agentId: agent._id,
        agentVersionId: agent.currentVersionId,
        contactId: contact._id,
        phoneNumberId: outboundNumber?._id,
        provider: "livekit",
        providerCallId: roomNameForCall("pending"),
        idempotencyKey: idempotencyKey || undefined,
        direction: "outbound",
        fromNumber,
        toNumber: normalized,
        status: "QUEUED",
        metadata: {
          source: "single-dial",
          ...metadata,
        },
      });
      // Room maps 1:1 to the session; stamp it now for webhook linkage.
      await CallRepository.transitionState(call._id, "QUEUED", {
        providerCallId: roomNameForCall(call._id.toString()),
      } as never).catch(() => null);
    } catch (err: unknown) {
      if (idempotencyKey && (err as { code?: number }).code === 11000) {
        const existing = await CallRepository.findByIdempotencyKey(
          orgId,
          idempotencyKey
        );
        if (existing) {
          return NextResponse.json({
            call: {
              id: existing._id.toString(),
              org_id: existing.organizationId.toString(),
              status: existing.status.toLowerCase(),
              to_number: existing.toNumber,
              from_number: existing.fromNumber || "",
              provider_call_id: existing.providerCallId || null,
              enqueued: !["COMPLETED", "FAILED", "BUSY", "NO_ANSWER", "CANCELLED"].includes(existing.status),
            },
            idempotent: true,
          });
        }
      }
      throw err;
    }

    // 9. Audit event
    await CallRepository.addEvent({
      callId: call._id,
      organizationId: orgId,
      type: "call.created",
      data: {
        agent_id: agentId,
        to_number: normalized,
        from_number: fromNumber,
      },
      idempotencyKey: `created:${call._id}`,
    });

    // 10. Dial via LiveKit: room + AgentDispatch + SIP participant
    // (outbound trunk -> Plivo termination). Callee speaks first; the agent
    // responds after first speech (no greet-first on dial-out).
    const room = roomNameForCall(call._id.toString());
    const livekitStartedAt = performance.now();
    let dispatchId = "";
    try {
      const { AgentDispatchClient, SipClient } = await import("livekit-server-sdk") as unknown as {
        AgentDispatchClient: new (u: string, k: string, s: string) => {
          createDispatch: (room: string, agentName: string, opts?: { metadata?: string }) => Promise<{ dispatchId?: string; id?: string }>;
        };
        SipClient: new (u: string, k: string, s: string) => {
          createSipParticipant: (
            sipTrunkId: string,
            number: string,
            roomName: string,
            opts?: {
              fromNumber?: string;
              participantIdentity?: string;
              participantName?: string;
              waitUntilAnswered?: boolean;
            }
          ) => Promise<unknown>;
        };
      };
      const url = process.env.LIVEKIT_URL || "";
      const key = process.env.LIVEKIT_API_KEY || "";
      const secret = process.env.LIVEKIT_API_SECRET || "";
      const dispatchClient = new AgentDispatchClient(url, key, secret);
      const dispatch = await dispatchClient.createDispatch(
        room,
        LIVEKIT_AGENT_NAME,
        {
          metadata: buildDispatchMetadata({
            orgId,
            agentId: agent._id.toString(),
            callId: call._id.toString(),
            phoneNumber: normalized,
            campaignId: campaignId ? String(campaignId) : undefined,
            workflowId: workflowId ? String(workflowId) : undefined,
            customerContext: (customerContext || metadata) as Record<string, unknown>,
            promptInjection: promptInjection ? String(promptInjection) : undefined,
            voiceId: voiceId ? String(voiceId) : undefined,
            direction: "outbound",
            room,
          }),
        }
      );
      dispatchId = String(dispatch?.dispatchId || dispatch?.id || "");
      const sip = new SipClient(url, key, secret);
      await sip.createSipParticipant(
        outboundTrunkId,
        normalized,
        room,
        {
          fromNumber,
          participantIdentity: normalized,
          waitUntilAnswered: true,
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "LiveKit dial failed";
      console.error("[api/calls] LiveKit dial failed:", message);
      await CallRepository.transitionState(call._id, "FAILED");
      await CallRepository.addEvent({
        callId: call._id,
        organizationId: orgId,
        type: "call.dial_failed",
        data: { reason: message },
        idempotencyKey: `dial-failed:${call._id}`,
      });
      return NextResponse.json({ error: `LiveKit outbound dial failed: ${message}` }, { status: 422 });
    }

    // Call accepted: dispatch owns the room now.
    await CallRepository.transitionState(call._id, "RINGING", {
      providerCallId: room,
    });
    await CallRepository.addEvent({
      callId: call._id,
      organizationId: orgId,
      type: "call.dispatched",
      data: { provider_call_id: room, dispatch_id: dispatchId },
      idempotencyKey: `dispatched:${call._id}`,
    });

    console.info(JSON.stringify({
      event: "api_latency",
      route: "/api/calls",
      stage: "response_ready",
      durationMs: Math.round(performance.now() - requestStartedAt),
      livekitDialMs: Math.round(performance.now() - livekitStartedAt),
      outcome: "accepted",
    }));

    return NextResponse.json(
      {
        call: {
          id: call._id.toString(),
          org_id: call.organizationId.toString(),
          status: "ringing",
          to_number: call.toNumber,
          from_number: fromNumber,
          provider_call_id: room,
          enqueued: true,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const httpStatus = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status: httpStatus });
  }
}
