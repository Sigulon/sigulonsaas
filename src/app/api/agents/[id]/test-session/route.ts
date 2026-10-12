import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { AgentRepository, CallRepository, CallModel } from "@sigulon/database";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { LIVEKIT_AGENT_NAME, buildDispatchMetadata, livekitEnv } from "@/lib/livekit";
import { prewarmCallConfig, getRedisClient } from "@/lib/redis";
import { callConfigCacheKey } from "@/lib/agent-config";
import { browserTestConfig, isRoomMissing, mongoId, testSessionRequest } from "@/lib/browser-test-session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // getOrgContext currently has a development fallback; never allow it here.
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgId, role, userId, orgName } = await getOrgContext();
    if (userId !== user._id.toString() || !canCreateAndRun(role)) {
      return NextResponse.json({ error: "Requires member role or higher" }, { status: 403 });
    }
    const { id: agentId } = await params;
    if (!mongoId.safeParse(agentId).success) return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
    const parsed = testSessionRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid test session request" }, { status: 400 });
    const body = parsed.data;
    const agent = await AgentRepository.findById(agentId, orgId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    const env = livekitEnv();
    if (!env.url || !env.apiKey || !env.apiSecret) {
      return NextResponse.json({ error: "LiveKit is not configured" }, { status: 503 });
    }
    const rooms = new RoomServiceClient(env.url, env.apiKey, env.apiSecret);

    if (body.action === "end_call") {
      // Unpopulated, fully scoped query: a web test cannot end a telephone call
      // or another agent's/user's session, even in the same organization.
      const call = await CallModel.findOne({
        _id: body.callId, organizationId: orgId, agentId,
        provider: "livekit-web", "metadata.is_web_test": true,
        "metadata.test_user_id": userId,
      }).exec();
      if (!call) return NextResponse.json({ error: "Call session not found" }, { status: 404 });
      const roomName = `sigulon-test-${call._id}`;
      if (call.providerCallId !== roomName) throw new Error("Invalid room binding");
      try { await rooms.deleteRoom(roomName); } catch (error) { if (!isRoomMissing(error)) throw error; }
      // The worker/webhooks own transcripts, duration, billing and completion.
      // This endpoint only records the authenticated request to terminate.
      await CallRepository.addEvent({ callId: call._id, organizationId: orgId,
        type: "web_test_end_requested", idempotencyKey: `web-test-end:${call._id}` });
      return NextResponse.json({ success: true, callId: body.callId });
    }

    const effectiveVoice = body.voiceId ?? agent.config.voice.voiceId;
    if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(effectiveVoice)) {
      return NextResponse.json({ error: "A valid Cartesia voice ID is required" }, { status: 400 });
    }
    const call = await CallRepository.create({
      organizationId: orgId, agentId: agent._id, agentVersionId: agent.currentVersionId,
      provider: "livekit-web", direction: "inbound", status: "DIALING",
      fromNumber: "Web Tester", toNumber: agent.name,
      metadata: { is_web_test: true, test_user_id: userId },
    });
    const callId = call._id.toString();
    const roomName = `sigulon-test-${callId}`;
    let roomAttempted = false;
    try {
      const canonical = browserTestConfig(agent, orgId, orgName ?? "Workspace", callId, body);
      // Mandatory for draft agents and overrides: a Mongo fallback would run a
      // different configuration (and excludes draft agents altogether).
      if (!await prewarmCallConfig(callId, canonical)) throw new Error("Test configuration cache is unavailable");
      await CallModel.updateOne({ _id: callId, organizationId: orgId }, {
        $set: { providerCallId: roomName, "metadata.livekit_room": roomName },
      });
      const metadata = buildDispatchMetadata({ orgId, agentId, callId, direction: "inbound", room: roomName });
      roomAttempted = true;
      await rooms.createRoom({ name: roomName, emptyTimeout: 60, departureTimeout: 20, maxParticipants: 2, metadata });
      const token = new AccessToken(env.apiKey, env.apiSecret, { identity: `web-user-${userId}-${callId}`, name: "Web Tester", ttl: "10m" });
      token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
      const livekitToken = await token.toJwt();
      await new AgentDispatchClient(env.url, env.apiKey, env.apiSecret).createDispatch(roomName, LIVEKIT_AGENT_NAME, { metadata });
      return NextResponse.json({ callId, roomName, livekitToken, livekitUrl: env.url });
    } catch (error) {
      const cleanup = await Promise.allSettled([
        roomAttempted ? rooms.deleteRoom(roomName).catch((e) => { if (!isRoomMissing(e)) throw e; }) : Promise.resolve(),
        getRedisClient().then((redis) => redis?.del(callConfigCacheKey(callId))),
        CallRepository.transitionState(callId, "FAILED", { endedAt: new Date() }),
      ]);
      if (cleanup.some((result) => result.status === "rejected")) console.error("[test-session] Session cleanup incomplete", { callId });
      console.error("[test-session] Initialization failed", { callId, error: error instanceof Error ? error.message : "unknown" });
      return NextResponse.json({ error: "Unable to start voice session. Check LiveKit, the voice worker and Redis." }, { status: 503 });
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    console.error("[test-session] Request failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: status === 500 ? "Voice session request failed" : "Access denied" }, { status });
  }
}
