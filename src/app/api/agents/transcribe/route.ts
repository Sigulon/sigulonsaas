import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OrganizationRepository } from "@sigulon/database";
import { ACTIVE_ORG_COOKIE_NAME, getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const AUTH_TIMEOUT_MS = 5_000;

function failure(status: number, code: string, error: string) {
  return NextResponse.json(
    { success: false, transcript: "", code, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function authorize() {
  // Do not use getOrgContext: it can fall back to a different active user.
  const user = await getAuthenticatedUser();
  if (!user || user.status !== "active") return 401;
  const activeOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE_NAME)?.value;
  if (activeOrgId) {
    if (!/^[a-f\d]{24}$/i.test(activeOrgId)) return 403;
    const member = await OrganizationRepository.getMember(activeOrgId, user._id.toString());
    return member ? 200 : 403;
  }
  const memberships = await OrganizationRepository.findUserMemberships(user._id.toString());
  return memberships.length ? 200 : 403;
}

export async function POST(req: NextRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      authorize(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Authorization timed out")), AUTH_TIMEOUT_MS);
      }),
    ]);
    if (status === 401) return failure(401, "UNAUTHORIZED", "Sign in to transcribe audio.");
    if (status === 403) return failure(403, "FORBIDDEN", "Organization membership is required.");

    const length = req.headers.get("content-length");
    if (length !== null && !/^\d+$/.test(length)) {
      return failure(400, "INVALID_CONTENT_LENGTH", "Invalid upload length.");
    }
    if (length !== null && Number(length) > MAX_REQUEST_BYTES) {
      return failure(413, "UPLOAD_TOO_LARGE", "Audio uploads must not exceed 8 MiB.");
    }
    if (!/^multipart\/form-data(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) {
      return failure(415, "UNSUPPORTED_MEDIA_TYPE", "Expected a multipart audio upload.");
    }

    // Verified against livekit.agents.inference.stt: offline_recognize=False;
    // _recognize_impl raises NotImplementedError. The /stt gateway is WebSocket:
    // session.create -> base64 input_audio (mono pcm_s16le) -> session.finalize.
    // See https://docs.livekit.io/agents/models/stt/ (standalone streaming).
    // Browser WebM/Opus uploads need a bounded decoder/resampler and final-event
    // draining; this web deployment does not provide that adapter. Do not send
    // compressed files as PCM, invent an HTTP batch URL, or fall back to Cartesia.
    // Reject BEFORE reading any body: all file types, sizes (including chunked
    // uploads) and durations are disabled, so no audio is buffered or processed.
    return failure(
      501,
      "LIVEKIT_UPLOAD_STT_UNSUPPORTED",
      "Audio upload transcription is unavailable. Use the live browser call to stream audio through LiveKit Inference, or enter your message as text. Uploads require a server-side audio decoding and LiveKit streaming adapter.",
    );
  } catch {
    return failure(503, "AUTH_UNAVAILABLE", "Unable to verify your session. Please try again.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
