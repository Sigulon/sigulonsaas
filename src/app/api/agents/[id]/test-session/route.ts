import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { AgentRepository, CallRepository } from "@sigulon/database";
import { CartesiaClient } from "@/lib/cartesia";
import { uploadRecordingToR2, R2_DEFAULT_BUCKET } from "@/lib/storage";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import {
  LIVEKIT_AGENT_NAME,
  buildDispatchMetadata,
  generateLiveKitChatCompletion,
} from "@/lib/livekit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const { orgId, role, cartesiaApiKey } = await getOrgContext();
    if (!canCreateAndRun(role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const body = await req.json();

    const {
      message = "",
      action = "turn",
      callId: incomingCallId,
      durationSeconds = 0,
      transcript = [],
      audioBase64: incomingAudioBase64,
      voiceId: overrideVoiceId,
      language: overrideLanguage,
      systemPrompt: overridePrompt,
    } = body;

    // Load the exact Agent configuration stored in MongoDB
    const agent = await AgentRepository.findById(agentId, orgId);

    const cartesia = new CartesiaClient(cartesiaApiKey);

    const voiceId =
      overrideVoiceId ||
      agent?.config?.voice?.voiceId ||
      "126a0835-beea-4e77-a883-f66eabcf6dd4";
    const language =
      overrideLanguage ||
      agent?.config?.identity?.language ||
      "en";
    const systemPrompt =
      overridePrompt ||
      agent?.config?.instructions?.systemPrompt ||
      "You are a helpful AI voice assistant.";
    const introduction =
      agent?.config?.instructions?.greeting || "";

    // =========================================================================
    // ACTION: END_CALL (Persist transcript & upload audio to Cloudflare R2)
    // =========================================================================
    if (action === "end_call") {
      const targetCallId = incomingCallId;
      if (!targetCallId) {
        return NextResponse.json({ error: "callId is required to complete call session" }, { status: 400 });
      }

      const call = await CallRepository.findById(targetCallId, orgId);
      if (!call) {
        return NextResponse.json({ error: "Call session not found" }, { status: 404 });
      }

      // 1. Format and save turn-by-turn transcripts to MongoDB
      const turns = Array.isArray(transcript)
        ? transcript.map((t: { role?: string; content?: string; text?: string }) => ({
            speaker: (t.role === "assistant" || t.role === "agent" ? "agent" : "user") as "user" | "agent",
            text: String(t.content || t.text || ""),
          }))
        : [];

      if (turns.length > 0) {
        await CallRepository.saveTranscript(call._id, call.organizationId, turns).catch((err) =>
          console.warn("[test-session] Failed saving transcript:", err)
        );
      }

      // 2. Upload recorded audio to Cloudflare R2 if audio provided
      let recordingUrl: string | undefined;
      const objectKey = `recordings/web-test-${targetCallId}.webm`;

      if (incomingAudioBase64 && typeof incomingAudioBase64 === "string") {
        try {
          const cleanBase64 = incomingAudioBase64.replace(/^data:audio\/\w+;base64,/, "");
          const audioBuffer = Buffer.from(cleanBase64, "base64");

          const uploadResult = await uploadRecordingToR2({
            objectKey,
            body: audioBuffer,
            mimeType: "audio/webm",
            bucket: R2_DEFAULT_BUCKET,
          });

          await CallRepository.saveRecording({
            callId: call._id,
            organizationId: call.organizationId,
            storageProvider: "r2",
            bucket: R2_DEFAULT_BUCKET,
            objectKey,
            durationSeconds: Math.round(durationSeconds),
            format: "webm",
            sizeBytes: audioBuffer.length,
            status: "ready",
          }).catch((err) => console.warn("[test-session] Failed saving recording metadata:", err));

          recordingUrl = uploadResult.url || `/api/recordings/stream/${encodeURIComponent(objectKey)}`;
        } catch (err) {
          console.error("[test-session] Error uploading audio to Cloudflare R2:", err);
        }
      }

      // 3. Extract heuristic outcome & summary
      const userText = turns
        .filter((t) => t.speaker === "user")
        .map((t) => t.text)
        .join(" ")
        .toLowerCase();

      let outcome = "completed";
      if (/interest|yes|book|appointment|sure|price|quote|visit/i.test(userText)) {
        outcome = "interested";
      } else if (/no|not interested|stop|don't|wrong/i.test(userText)) {
        outcome = "not_interested";
      }

      await CallRepository.saveOutcome(call._id, call.organizationId, {
        disposition: outcome,
        customFields: { notes: `Web Voice Simulator test (${turns.length} turns)` },
      }).catch(() => null);

      const summary = `Web Voice test completed (${turns.length} turns). Outcome: ${outcome}.`;

      // 4. Update Call to COMPLETED
      await CallRepository.transitionState(call._id, "COMPLETED", {
        endedAt: new Date(),
        durationSeconds: Math.max(1, Math.round(durationSeconds)),
        summary,
        metadata: {
          ...(call.metadata || {}),
          ...(recordingUrl ? { recordingUrl } : {}),
          outcome,
          is_web_test: true,
        },
      } as never).catch((err) => console.warn("[test-session] Transition state error:", err));

      return NextResponse.json({
        success: true,
        callId: targetCallId,
        recordingUrl,
        outcome,
        turnsCount: turns.length,
      });
    }

    // =========================================================================
    // ACTION: INIT (Create MongoDB Call + LiveKit Room Token & Cartesia Greeting)
    // =========================================================================
    if (action === "init") {
      let greetingText = introduction;
      if (!greetingText) {
        if (language === "hi") {
          greetingText = "नमस्ते! मैं आपकी किस प्रकार सहायता कर सकता हूँ?";
        } else if (language === "te") {
          greetingText = "నమస్కారం! నేను మీకు ఎలా సహాయపడగలను?";
        } else if (language === "ta") {
          greetingText = "வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?";
        } else if (language === "kn") {
          greetingText = "ನಮಸ್ಕಾರ! ನಾನು మీకు ఎలా సహాయపడగలను?";
        } else {
          greetingText = `Hello! Thank you for calling ${agent?.name || "us"}. How may I help you today?`;
        }
      }

      // Synthesize greeting with Cartesia Sonic
      let audioBase64: string | null = null;
      try {
        const audioBuffer = await cartesia.generateSpeech({
          transcript: greetingText,
          voiceId,
          language,
        });
        audioBase64 = Buffer.from(audioBuffer).toString("base64");
      } catch (ttsErr) {
        console.warn("[test-session] Cartesia TTS error on greeting:", ttsErr);
      }

      // Create persistent Call record in MongoDB for this web test session
      let callId = incomingCallId;
      try {
        const createdCall = await CallRepository.create({
          organizationId: orgId,
          agentId: agent?._id || agentId,
          agentVersionId: agent?.currentVersionId,
          provider: "livekit-web",
          direction: "inbound",
          fromNumber: "Web Simulator",
          toNumber: agent?.name || "AI Voice Agent",
          status: "IN_PROGRESS",
          metadata: {
            is_web_test: true,
            voiceId,
            language,
          },
        });
        callId = createdCall._id.toString();

        // Seed initial greeting turn in Transcript
        await CallRepository.saveTranscript(createdCall._id, orgId, [
          { speaker: "agent", text: greetingText },
        ]).catch(() => null);
      } catch (err) {
        console.warn("[test-session] Could not create Call doc for test session:", err);
      }

      // Generate LiveKit Cloud Room Token and Dispatch if LiveKit is configured
      let livekitToken: string | undefined;
      let roomName: string | undefined;
      const livekitUrl = process.env.LIVEKIT_URL;
      const livekitKey = process.env.LIVEKIT_API_KEY;
      const livekitSecret = process.env.LIVEKIT_API_SECRET;

      if (livekitUrl && livekitKey && livekitSecret && callId) {
        try {
          roomName = `sigulon-test-${callId}`;
          const at = new AccessToken(livekitKey, livekitSecret, {
            identity: `web-user-${Date.now()}`,
            name: "Web Tester",
            ttl: "1h",
          });
          at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
          });
          livekitToken = await at.toJwt();

          // Dispatch the LiveKit Agent worker for LiveKit Inference
          const dispatchClient = new AgentDispatchClient(livekitUrl, livekitKey, livekitSecret);
          await dispatchClient.createDispatch(
            roomName,
            LIVEKIT_AGENT_NAME,
            {
              metadata: buildDispatchMetadata({
                orgId,
                agentId: agent?._id.toString() || agentId,
                callId,
                direction: "inbound",
                room: roomName,
              }),
            }
          ).catch((dispatchErr) => {
            console.warn("[test-session] Agent dispatch (optional if running live):", dispatchErr?.message);
          });
        } catch (tokenErr) {
          console.warn("[test-session] LiveKit token generation check:", tokenErr);
        }
      }

      return NextResponse.json({
        callId,
        replyText: greetingText,
        audioBase64,
        audioMimeType: "audio/mpeg",
        livekitToken,
        livekitUrl,
        roomName,
      });
    }

    // =========================================================================
    // ACTION: TURN (LiveKit Inference Gemini 2.5 Flash + Cartesia Sonic TTS)
    // =========================================================================
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const history = Array.isArray(body.history) ? body.history : [];
    const conversationMessages = [
      ...history.map((h: { role?: string; content?: string }) => ({
        role: h.role === "assistant" || h.role === "agent" ? "assistant" : "user",
        content: String(h.content || ""),
      })),
      { role: "user", content: message },
    ];

    let replyText = "";
    try {
      replyText = await generateLiveKitChatCompletion({
        messages: conversationMessages,
        systemPrompt,
        language,
        temperature: agent?.config?.intelligence?.temperature ?? 0.7,
      });
    } catch (llmErr) {
      console.error("[test-session] LiveKit Inference error:", llmErr);
      replyText = "I understand. How else may I help you today?";
    }

    // Synthesize real AI voice response with Cartesia Sonic using agent's voice
    let audioBase64: string | null = null;
    try {
      const audioBuffer = await cartesia.generateSpeech({
        transcript: replyText,
        voiceId,
        language,
      });
      audioBase64 = Buffer.from(audioBuffer).toString("base64");
    } catch (ttsErr) {
      console.warn("[test-session] Cartesia TTS error on turn:", ttsErr);
    }

    return NextResponse.json({
      replyText,
      audioBase64,
      audioMimeType: "audio/mpeg",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Test session error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
