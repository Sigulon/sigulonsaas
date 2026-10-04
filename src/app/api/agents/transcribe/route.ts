import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { cartesiaApiKey } = await getOrgContext();
    const effectiveApiKey = cartesiaApiKey || process.env.CARTESIA_API_KEY;

    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: "Cartesia API key not configured for STT." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("file") as Blob | null;
    const language = (formData.get("language") as string | null) || "te";

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided in request." },
        { status: 400 }
      );
    }

    const cartesiaFormData = new FormData();
    cartesiaFormData.append("file", audioFile, "recording.webm");
    cartesiaFormData.append("model", "ink-whisper");
    if (language) {
      // Cartesia supports 2-letter or standard language codes
      const cleanLang = language.split("-")[0].toLowerCase();
      cartesiaFormData.append("language", cleanLang);
    }

    const cartesiaBaseUrl = process.env.CARTESIA_BASE_URL || "https://api.cartesia.ai";
    const sttResponse = await fetch(`${cartesiaBaseUrl}/stt`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveApiKey}`,
        "Cartesia-Version": "2026-08-14",
      },
      body: cartesiaFormData,
    });

    if (!sttResponse.ok) {
      const errText = await sttResponse.text();
      console.warn(`[POST /api/agents/transcribe] Cartesia STT error (${sttResponse.status}):`, errText);
      return NextResponse.json(
        { error: `STT service error: ${sttResponse.statusText}`, details: errText },
        { status: 502 }
      );
    }

    const sttData = await sttResponse.json();
    const transcript = (sttData.text || sttData.transcript || "").trim();

    return NextResponse.json({
      success: true,
      transcript,
    });
  } catch (err: unknown) {
    console.error("[POST /api/agents/transcribe] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
