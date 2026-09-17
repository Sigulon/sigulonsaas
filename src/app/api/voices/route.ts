import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { cartesiaApiKey } = await getOrgContext();
    const { searchParams } = new URL(req.url);
    const language = searchParams.get("language") || "hi";

    let apiVoices: Array<{
      id: string;
      name: string;
      description?: string;
      gender?: string;
      language?: string;
      preview_file_url?: string;
    }> = [];

    if (cartesiaApiKey) {
      try {
        const res = await fetch("https://api.cartesia.ai/voices", {
          headers: {
            "X-API-Key": cartesiaApiKey,
            "Cartesia-Version": "2024-06-10",
          },
        });
        if (res.ok) {
          apiVoices = await res.json();
        }
      } catch (e) {
        console.warn("Failed to fetch voices from Cartesia API:", e);
      }
    }

    // Filter by language if provided or Indian voices
    const filteredApiVoices = apiVoices.filter((v) => {
      if (language === "hi" || language === "te") {
        return (
          v.language === language ||
          (v.description && v.description.toLowerCase().includes(language === "hi" ? "hindi" : "telugu")) ||
          (v.name && v.name.toLowerCase().includes(language === "hi" ? "hindi" : "telugu"))
        );
      }
      return (
        v.language === language ||
        (v.name && /india|hindi|tamil|telugu|bengali|kannada|marathi/i.test(v.name)) ||
        (v.description && /india|hindi|tamil|telugu|bengali|kannada|marathi/i.test(v.description))
      );
    });

    // Merge with our curated Indian voice presets
    const combinedMap = new Map<string, {
      id: string;
      name: string;
      gender: string;
      accent: string;
      description: string;
      preview_url: string;
    }>();

    // Add preset voices matching or general
    CARTESIA_VOICE_PRESETS.forEach((preset) => {
      combinedMap.set(preset.id, {
        id: preset.id,
        name: preset.name,
        gender: preset.gender,
        accent: preset.accent,
        description: preset.description,
        preview_url: `/api/voices/${preset.id}/preview?language=${language}`,
      });
    });

    // Add any matching Cartesia API voices not already present
    filteredApiVoices.slice(0, 15).forEach((v) => {
      if (!combinedMap.has(v.id)) {
        combinedMap.set(v.id, {
          id: v.id,
          name: v.name,
          gender: v.gender || "neutral",
          accent: v.language ? v.language.toUpperCase() : "Indian Multilingual",
          description: v.description || "High naturalness neural voice model.",
          preview_url: `/api/voices/${v.id}/preview?language=${language}`,
        });
      }
    });

    return NextResponse.json({
      voices: Array.from(combinedMap.values()),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch voices";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
