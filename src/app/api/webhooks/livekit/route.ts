import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver, AgentDispatchClient } from "livekit-server-sdk";
import {
  CallRepository,
  CallModel,
  CampaignRepository,
  CampaignContactModel,
  BillingRepository,
  WebhookEventModel,
  PhoneNumberModel,
  ContactRepository,
  AgentRepository,
} from "@sigulon/database";
import { computeUsageCredits, reserveEstimateCredits, settleCallCredits } from "@/lib/credits";
import { hashPayload, parseDispatchMetadata, LIVEKIT_AGENT_NAME, buildDispatchMetadata } from "@/lib/livekit";
import { prewarmCallConfig } from "@/lib/redis";
import { toCanonicalAgentConfig } from "@/lib/agent-config";
import { VOICE_STACK } from "@/lib/voice-config";

export const dynamic = "force-dynamic";

function receiver(): WebhookReceiver {
  const apiKey = process.env.LIVEKIT_API_KEY || "";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "";
  return new WebhookReceiver(apiKey, apiSecret);
}

async function claimWebhookEvent(provider: string, eventId: string, eventType: string, payload: unknown): Promise<boolean> {
  // Idempotency via WebhookEvent (provider, eventId) unique index.
  // Returns true when this delivery is the first claim.
  try {
    await WebhookEventModel.create({
      provider,
      eventId,
      eventType,
      payloadHash: hashPayload(payload),
      status: "received",
      receivedAt: new Date(),
    });
    return true;
  } catch {
    // A previous delivery may have failed after the idempotency row was
    // claimed. Let LiveKit's retry take another pass for failed events.
    const retry = await WebhookEventModel.updateOne(
      { provider, eventId, status: "failed" },
      { $set: { status: "received", payloadHash: hashPayload(payload), receivedAt: new Date(), error: "" } }
    ).exec().catch(() => null);
    return Boolean(retry?.modifiedCount);
  }
}

async function markWebhookEvent(eventId: string, status: "processed" | "failed", error?: string) {
  try {
    await WebhookEventModel.findOneAndUpdate(
      { provider: "livekit", eventId },
      { $set: { status, processedAt: new Date(), ...(error ? { error } : {}) } }
    ).exec();
  } catch {
    // best-effort
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const authHeader = req.headers.get("Authorization") || "";
  let event: { event: string; id?: string; room?: { name?: string; metadata?: string }; participant?: { identity?: string }; egressInfo?: { roomName?: string; url?: string; duration?: number; fileResults?: { filename?: string; location?: string; size?: number; duration?: number }[] }; [k: string]: unknown };
  try {
    // livekit-server-sdk verifies asynchronously. Do not cast the Promise to
    // an event or signature failures will bypass this handler entirely.
    event = await receiver().receive(rawBody, authHeader) as unknown as typeof event;
  } catch (err) {
    console.error("[livekit/webhook] invalid signature:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 403 });
  }

  const eventType = String(event.event || "unknown");
  const eventId = String(event.id || `${eventType}:${Date.now()}`);
  const claimed = await claimWebhookEvent("livekit", eventId, eventType, event);
  if (!claimed) {
    // Replay x3 -> single processing (exactly-once side effects below).
    return NextResponse.json({ success: true, deduped: true });
  }

  try {
        const roomName = event.room?.name || event.egressInfo?.roomName || "";
    const roomMetadata = parseDispatchMetadata(event.room?.metadata || "");
    // Fall back to room-name -> call linkage for outbound rooms we created.
    const callIdFromRoom = roomName.startsWith("sigulon-call-")
      ? roomName.slice("sigulon-call-".length)
      : "";

    async function resolveInboundCall(
      rName: string,
      meta: ReturnType<typeof parseDispatchMetadata>,
      part?: { identity?: string; attributes?: Record<string, string> }
    ) {
      // 1. If we already have metadata with orgId and agentId
      if (meta?.orgId && meta?.agentId) {
        return {
          orgId: meta.orgId,
          agentId: meta.agentId,
          dialedNumber: meta.phoneNumber || "",
          callerNumber: part?.identity || "",
          customerContext: meta.customerContext,
          direction: meta.direction || "inbound",
        };
      }

      // 2. Otherwise extract from SIP participant attributes (LiveKit Telephony)
      const attrs = part?.attributes || {};
      const dialedNumber =
        attrs["sip.phoneNumber"] ||
        attrs["sip.trunkPhoneNumber"] ||
        attrs["sip.calledNumber"] ||
        "";
      const callerNumber =
        attrs["sip.callFrom"] ||
        (part?.identity ? part.identity.replace(/^sip_/, "") : "");

      if (!dialedNumber) return null;

      // Map dialed phone number to tenant & assigned agent
      const phoneDoc = await PhoneNumberModel.findOne({
        phoneNumber: dialedNumber,
        status: "active",
      }).exec();

      if (!phoneDoc || !phoneDoc.organizationId) {
        console.warn(`[livekit/webhook] Inbound call to unmapped number: ${dialedNumber}`);
        return null;
      }

      const orgId = phoneDoc.organizationId.toString();
      let agentId = phoneDoc.agentId ? phoneDoc.agentId.toString() : "";

      if (!agentId) {
        // Fall back to tenant's first active agent
        const activeAgents = await AgentRepository.findByOrg(orgId, { status: "active" }).catch(() => []);
        const defaultAgent = activeAgents[0] || null;
        if (defaultAgent) {
          agentId = defaultAgent._id.toString();
        }
      }

      if (!agentId) {
        console.warn(`[livekit/webhook] No active agent configured for tenant ${orgId}`);
        return null;
      }

      // Resolve customer context if known
      let customerContext: Record<string, unknown> | undefined = undefined;
      if (callerNumber) {
        const contact = await ContactRepository.findByNormalizedPhone(orgId, callerNumber).catch(() => null);
        if (contact) {
          customerContext = {
            name: contact.name,
            phone: contact.phone,
            ...(contact.customFields || {}),
          };
        }
      }

      return {
        orgId,
        agentId,
        dialedNumber,
        callerNumber,
        customerContext,
        direction: "inbound" as const,
      };
    }

    switch (eventType) {
      case "room_started":
      case "participant_joined": {
        let call = callIdFromRoom
          ? await CallRepository.findById(callIdFromRoom).catch(() => null)
          : await CallRepository.findByProviderCallId(roomName).catch(() => null);

        if (!call) {
          const inbound = await resolveInboundCall(
            roomName,
            roomMetadata,
            event.participant as { identity?: string; attributes?: Record<string, string> }
          );

          if (!inbound) {
            if (eventType === "room_started" && !roomMetadata) {
              await markWebhookEvent(eventId, "processed");
              return NextResponse.json({ success: true, ignored: true });
            }
            break;
          }

          const agent = await AgentRepository.findById(inbound.agentId, inbound.orgId);
          if (!agent) {
            await markWebhookEvent(eventId, "failed", "agent not found");
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
          }

          call = await CallRepository.create({
            organizationId: inbound.orgId,
            agentId: agent._id,
            agentVersionId: agent.currentVersionId,
            provider: "livekit",
            providerCallId: roomName,
            direction: inbound.direction || "inbound",
            fromNumber: inbound.callerNumber || event.participant?.identity || "",
            toNumber: inbound.dialedNumber || "",
            status: "IN_PROGRESS",
            metadata: {
              livekit_room: roomName,
              dispatch: roomMetadata,
              customerContext: inbound.customerContext,
            },
          });

          // Pre-warm config for voice worker
          try {
            const canonical = toCanonicalAgentConfig(
              {
                id: agent._id.toString(),
                org_id: inbound.orgId,
                name: agent.name,
                language: agent.config.identity.language,
                voice_id: agent.config.voice.voiceId,
                system_prompt: agent.config.instructions.systemPrompt,
                introduction: agent.config.instructions.greeting,
                status: agent.status,
                llm_provider: VOICE_STACK.LLM.PROVIDER,
                llm_model: VOICE_STACK.LLM.MODEL,
                stt_provider: VOICE_STACK.STT.PROVIDER,
                enabled_tools: agent.config.tools.enabledTools,
                // Mongo uses camelCase; the canonical runtime contract uses
                // snake_case. Keep cached and Mongo fallback behavior equal.
                settings: {
                  speed: agent.config.voice.speed,
                  max_call_duration_seconds: agent.config.settings.maxCallDuration,
                  silence_timeout_seconds: agent.config.settings.silenceTimeout,
                  record_calls: agent.config.settings.recordingEnabled,
                },
                bundle: agent.bundle,
                created_at: agent.createdAt.toISOString(),
                updated_at: agent.updatedAt.toISOString(),
              } as never,
              "Workspace"
            );
            await prewarmCallConfig(call._id.toString(), canonical);
          } catch (err) {
            console.warn(`[livekit/webhook] redis pre-warm failed for ${call._id}:`, err);
          }

          // If roomMetadata was missing (direct SIP trunk call), explicitly dispatch the voice agent now
          if (!roomMetadata) {
            try {
              const url = process.env.LIVEKIT_URL || "";
              const key = process.env.LIVEKIT_API_KEY || "";
              const secret = process.env.LIVEKIT_API_SECRET || "";
              const dispatchClient = new AgentDispatchClient(url, key, secret);
              await dispatchClient.createDispatch(
                roomName,
                LIVEKIT_AGENT_NAME,
                {
                  metadata: buildDispatchMetadata({
                    orgId: inbound.orgId,
                    tenantId: inbound.orgId,
                    agentId: inbound.agentId,
                    callId: call._id.toString(),
                    phoneNumber: inbound.dialedNumber,
                    customerContext: inbound.customerContext,
                    direction: "inbound",
                    room: roomName,
                  }),
                }
              );
              console.info(`[livekit/webhook] Explicitly dispatched agent for inbound call room=${roomName}`);
            } catch (dispatchErr) {
              console.error(`[livekit/webhook] Agent dispatch failed for inbound call room=${roomName}:`, dispatchErr);
            }
          }
        }

        // Reserve credits via internal API logic (idempotent per call).
        try {
          await BillingRepository.reserveCallCredits({
            organizationId: call.organizationId,
            callId: call._id,
            estimate: reserveEstimateCredits(),
          });
        } catch (err) {
          console.error(`[livekit/webhook] reserve failed for ${call._id}:`, err);
        }

        await CallRepository.addEvent({
          callId: call._id,
          organizationId: call.organizationId,
          type: `livekit.${eventType}`,
          data: { identity: event.participant?.identity || "", room: roomName },
          idempotencyKey: `livekit-${eventType}:${eventId}`,
        });

        if (eventType === "participant_joined" && !call.answeredAt) {
          await CallRepository.transitionState(call._id, "ANSWERED", { answeredAt: new Date() } as never).catch(() => null);
        }
        break;
      }
      case "participant_left": {
        const call = callIdFromRoom
          ? await CallRepository.findById(callIdFromRoom).catch(() => null)
          : await CallRepository.findByProviderCallId(roomName).catch(() => null);
        if (call) {
          await CallRepository.addEvent({
            callId: call._id,
            organizationId: call.organizationId,
            type: "livekit.participant_left",
            data: { identity: event.participant?.identity || "", room: roomName },
            idempotencyKey: `livekit-participant_left:${eventId}`,
          });
        }
        break;
      }
      case "room_finished": {
        const call = callIdFromRoom
          ? await CallRepository.findById(callIdFromRoom).catch(() => null)
          : await CallRepository.findByProviderCallId(roomName).catch(() => null);
        if (!call) {
          await markWebhookEvent(eventId, "processed");
          return NextResponse.json({ success: true, unknown: true });
        }
        // Atomic UsageRecord $inc guarded by ended_at==null (exactly-once).
        const duration = Math.max(0, Math.round((Date.now() - new Date(call.createdAt).getTime()) / 1000));
        const usageCredits = computeUsageCredits(duration);
        const terminalized = await CallRepository.addEvent({
          callId: call._id,
          organizationId: call.organizationId,
          type: "call.terminalized",
          data: { status: "COMPLETED", duration, source: "livekit.room_finished" },
          idempotencyKey: `terminal:${call._id}`,
        }).catch(() => null);
        if (terminalized) {
          // Sweep recovery: a stale-sweep may have forced FAILED on a call
          // that later completed legitimately. FAILED is terminal in the
          // state machine, so COMPLETED cannot override it via
          // transitionState — allow the override ONLY when the failure was
          // tagged stale_sweep. All other FAILED rows stay terminal.
          const isSweepRecovery =
            call.status === "FAILED" &&
            (call.metadata as Record<string, unknown> | undefined)?.["fail_reason"] === "stale_sweep";
          if (isSweepRecovery) {
            await CallModel.findOneAndUpdate(
              { _id: call._id, status: "FAILED" },
              {
                $set: {
                  status: "COMPLETED",
                  endedAt: new Date(),
                  durationSeconds: duration,
                  "metadata.sweep_recovered": true,
                },
                $unset: { "metadata.fail_reason": "" },
              }
            ).exec().catch(() => null);
          } else {
            await CallRepository.transitionState(call._id, "COMPLETED", {
              endedAt: new Date(),
              durationSeconds: duration,
            } as never).catch(() => null);
          }
          try {
            await settleCallCredits(null, call.organizationId.toString(), call._id.toString(), usageCredits);
          } catch (err) {
            console.error(`[livekit/webhook] settle failed for ${call._id}:`, err);
          }
          if (call.campaignId && call.contactId) {
            await CampaignContactModel.findOneAndUpdate(
              {
                campaignId: call.campaignId,
                contactId: call.contactId,
                organizationId: call.organizationId,
                callStatus: {
                  $in: isSweepRecovery
                    ? ["pending", "queued", "dialing", "ringing", "answered", "failed"]
                    : ["pending", "queued", "dialing", "ringing", "answered"],
                },
              },
              { $set: { callStatus: "completed", lastAttemptAt: new Date() } }
            ).exec().catch(() => null);
            await CampaignRepository.incrementCompletedCalls(call.campaignId).catch(() => null);
            await CampaignRepository.checkAndMarkCompletion(call.campaignId).catch(() => null);
          }
          // Postcall transcript/summary arrives from the worker via
          // POST /api/internal/calls/postcall (room_finished is the
          // fallback trigger only — nothing to enqueue here).
        }
        break;
      }
      case "egress_ended": {
        const info = event.egressInfo || {};
        const file = info.fileResults?.[0];
        const objectKey = String(file?.filename || "").replace(/^\/+/, "");
        const call = callIdFromRoom
          ? await CallRepository.findById(callIdFromRoom).catch(() => null)
          : await CallRepository.findByProviderCallId(roomName).catch(() => null);
        if (call && objectKey) {
          const { TranscriptModel } = await import("@sigulon/database");
          const transcript = await TranscriptModel.findOne({
            callId: call._id,
            organizationId: call.organizationId,
          }).lean().exec();
          await CallRepository.saveRecording({
            callId: call._id,
            organizationId: call.organizationId,
            storageProvider: "r2",
            bucket: process.env.R2_BUCKET_NAME || "sigulon-storage",
            objectKey,
            durationSeconds: Number(file?.duration ?? info.duration ?? 0),
            sizeBytes: Number(file?.size ?? 0),
            format: objectKey.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/ogg",
            status: "ready",
            // Transcript persistence can arrive before or after egress. Read
            // MongoDB at this point so either event order produces the same
            // final status.
            transcriptionStatus: transcript?.segments?.length ? "completed" : "pending",
          });
          const recordingUrl = file?.location || info.url;
          if (recordingUrl) {
            await CallModel.findOneAndUpdate(
              { _id: call._id, organizationId: call.organizationId },
              { $set: { "metadata.recordingUrl": recordingUrl } }
            ).exec();
          }
        } else if (call) {
          // An ended egress without a file is terminal for this recording.
          // Keep the call visible and make the failure actionable instead of
          // leaving the dashboard in an infinite pending state.
          const { RecordingModel } = await import("@sigulon/database");
          await RecordingModel.updateOne(
            { callId: call._id, organizationId: call.organizationId },
            { $set: { status: "failed", transcriptionStatus: "failed" } }
          ).exec().catch(() => null);
        }
        break;
      }
      case "agent_dispatch_failed":
      case "dispatch_failed": {
        console.error(`[livekit/webhook] dispatch failed room=${roomName}`);
        const call = callIdFromRoom
          ? await CallRepository.findById(callIdFromRoom).catch(() => null)
          : null;
        if (call) {
          await CallRepository.transitionState(call._id, "FAILED", { endedAt: new Date() } as never).catch(() => null);
          // Refund reservation (settle with usage 0).
          try {
            await settleCallCredits(null, call.organizationId.toString(), call._id.toString(), 0);
          } catch {
            // best-effort
          }
        }
        break;
      }
      default: {
        await markWebhookEvent(eventId, "processed");
        return NextResponse.json({ success: true, ignored: true, event: eventType });
      }
    }

    await markWebhookEvent(eventId, "processed");
    return NextResponse.json({ success: true, event: eventType });
  } catch (err) {
    console.error("[livekit/webhook] processing error:", err);
    await markWebhookEvent(eventId, "failed", String(err));
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
