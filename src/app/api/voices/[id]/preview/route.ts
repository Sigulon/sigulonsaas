import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { CartesiaClient } from "@/lib/cartesia";

export const dynamic = "force-dynamic";

const PREVIEW_TEXTS: Record<string, string> = {
  hi: "नमस्ते! मैं आपकी कंपनी की ओर से ग्राहकों से बात करने के लिए तैयार हूँ।",
  te: "నమస్కారం! నేను మీ వ్యాపారం కోసం కాల్స్ మాట్లాడటానికి సిద్ధంగా ఉన్నాను.",
  ta: "வணக்கம்! நான் உங்கள் வணிகத்திற்காக வாடிக்கையாளர்களிடம் பேச தயாராக இருக்கிறேன்.",
  kn: "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕಾಗಿ ಗ್ರಾಹಕರೊಂದಿಗೆ ಮಾತನಾಡಲು ಸಿದ್ಧನಾಗಿದ್ದೇನೆ.",
  bn: "নমস্কার! আমি আপনার ব্যবসার জন্য গ্রাহকদের সাথে কথা বলতে প্রস্তুত।",
  mr: "नमस्कार! मी तुमच्या व्यवसायासाठी ग्राहकांशी बोलण्यास पूर्णपणे तयार आहे.",
  gu: "નમસ્તે! હું તમારા વ્યવસાય માટે ગ્રાહકો સાથે વાત કરવા તૈયાર છું.",
  ml: "നമസ്കാരം! നിങ്ങളുടെ ബിസിനസ്സിനായി ഉപഭോക്താക്കളോട് സംസാരിക്കാൻ ഞാൻ തയ്യാറാണ്.",
  pa: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ਲਈ ਗਾਹਕਾਂ ਨਾਲ ਗੱਲ ਕਰਨ ਲਈ ਤਿਆਰ ਹਾਂ।",
  en: "Hello! I am ready to represent your business and speak with your customers professionally.",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: voiceId } = await params;
    const { cartesiaApiKey } = await getOrgContext();
    const { searchParams } = new URL(req.url);
    const language = searchParams.get("language") || "hi";

    if (!voiceId) {
      return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
    }

    const transcript = PREVIEW_TEXTS[language] || PREVIEW_TEXTS.hi;
    const cartesia = new CartesiaClient(cartesiaApiKey);

    const audioBuffer = await cartesia.generateSpeech({
      transcript,
      voiceId,
      language,
    });

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to synthesize voice preview";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
