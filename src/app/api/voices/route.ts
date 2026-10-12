import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";
import type { CartesiaVoiceOption } from "@/components/agents/cartesia-voice-picker";

export const dynamic = "force-dynamic";

type CartesiaVoice = {
  id: string;
  name: string;
  description?: string;
  tagline?: string;
  gender?: string;
  language?: string;
  accents?: Array<{ accent?: string; locale?: string; is_native?: boolean }>;
};

type CartesiaVoicePage = { data?: CartesiaVoice[]; has_more?: boolean; next_page?: string | null };

export async function GET(req: NextRequest) {
  try {
    const { cartesiaApiKey } = await getOrgContext();
    const requestedLanguage = new URL(req.url).searchParams.get("language") || "hi-IN";
    const language = requestedLanguage.replaceAll("_", "-").toLowerCase();
    const presets = CARTESIA_VOICE_PRESETS.map((voice) => ({
      id: voice.id,
      name: voice.name,
      gender: voice.gender,
      accent: voice.accent,
      description: voice.description,
      preview_url: `/api/voices/${voice.id}/preview?language=${encodeURIComponent(language.split("-")[0])}`,
    }));

    const voicesById = new Map<string, CartesiaVoiceOption>(presets.map((voice) => [voice.id, voice]));
    if (cartesiaApiKey) {
      try {
        let cursor: string | null = null;
        for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
          const params = new URLSearchParams({ limit: "100", language, "expand[]": "preview_file_url" });
          if (cursor) params.set("starting_after", cursor);
          const response = await fetch(`https://api.cartesia.ai/voices?${params}`, {
            headers: {
              Authorization: `Bearer ${cartesiaApiKey}`,
              "Cartesia-Version": "2026-08-14",
            },
            signal: AbortSignal.timeout(8_000),
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`Cartesia voice catalog returned ${response.status}`);
          const page = await response.json() as CartesiaVoicePage;
          for (const voice of Array.isArray(page.data) ? page.data : []) {
            if (!voice.id || !voice.name) continue;
            const accent = voice.accents?.find((item) => item.locale?.toLowerCase() === language)?.accent
              || voice.accents?.[0]?.accent
              || voice.language
              || "Cartesia";
            voicesById.set(voice.id, {
              id: voice.id,
              name: voice.name,
              gender: voice.gender || "neutral",
              accent: accent.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
              description: voice.description || voice.tagline || "Cartesia voice",
              preview_url: `/api/voices/${encodeURIComponent(voice.id)}/preview?language=${encodeURIComponent(language.split("-")[0])}`,
            });
          }
          if (!page.has_more || !page.next_page) break;
          cursor = page.next_page;
        }
      } catch (error) {
        console.warn("Failed to fetch Cartesia voice catalog; using curated voices:", error);
      }
    }

    return NextResponse.json({ voices: Array.from(voicesById.values()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch voices";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
