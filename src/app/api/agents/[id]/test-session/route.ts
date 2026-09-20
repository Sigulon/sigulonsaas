import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { AgentRepository } from "@sigulon/database";
import { CartesiaClient } from "@/lib/cartesia";
import { OPENROUTER_DEFAULT_MODEL } from "@/lib/types";

export const dynamic = "force-dynamic";

interface HistoryItem {
  role: string;
  content: string;
}

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
      history = [],
      action = "turn",
      voiceId: overrideVoiceId,
      language: overrideLanguage,
      systemPrompt: overridePrompt,
    } = body;

    const agent = await AgentRepository.findById(agentId, orgId);

    const cartesia = new CartesiaClient(cartesiaApiKey);

    let voiceId = overrideVoiceId || agent?.config?.voice?.voiceId || "126a0835-beea-4e77-a883-f66eabcf6dd4";
    let language = overrideLanguage || agent?.config?.identity?.language || "hi";
    let systemPrompt = overridePrompt || agent?.config?.instructions?.systemPrompt || "You are a helpful AI voice assistant.";
    let introduction = agent?.config?.instructions?.greeting || "";

    if (!agent && !overrideVoiceId) {
      try {
        const cAgent = await cartesia.getAgent(agentId);
        if (cAgent) {
          voiceId = cAgent.tts_voice || voiceId;
          language = cAgent.tts_language || language;
          systemPrompt = cAgent.llm_system_prompt || systemPrompt;
          introduction = cAgent.llm_introduce || introduction;
        }
      } catch (e) {
        console.warn("Could not fetch agent directly from Cartesia:", e);
      }
    }

    // 2. Handle initial call greeting
    if (action === "init") {
      let greetingText = introduction;
      if (!greetingText) {
        // Extract identity or business from prompt if available
        const businessMatch = systemPrompt.match(/Business Overview:\s*([^\n]+)/i) ||
                              systemPrompt.match(/representing\s+([^\n.]+)/i);
        const bizName = businessMatch ? businessMatch[1].slice(0, 40) : "";

        if (language === "hi") {
          greetingText = bizName
            ? `नमस्ते! मैं ${bizName} से बात कर रहा हूँ। आज मैं आपकी क्या सहायता कर सकता हूँ?`
            : "नमस्ते! आपकी कॉल का स्वागत है। आज मैं आपकी किस सेवा में सहायता कर सकता हूँ?";
        } else if (language === "te") {
          greetingText = bizName
            ? `నమస్కారం! నేను ${bizName} నుండి మాట్లాడుతున్నాను. నేను మీకు ఎలా సహాయపడగలను?`
            : "నమస్కారం! స్వాగతం. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?";
        } else if (language === "ta") {
          greetingText = "வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?";
        } else if (language === "kn") {
          greetingText = "ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?";
        } else {
          greetingText = bizName
            ? `Hello! Thank you for calling ${bizName}. How can I help you today?`
            : "Hello! Thank you for calling. How can I assist you today?";
        }
      }

      const audioBuffer = await cartesia.generateSpeech({
        transcript: greetingText,
        voiceId,
        language,
      });

      const audioBase64 = Buffer.from(audioBuffer).toString("base64");

      return NextResponse.json({
        replyText: greetingText,
        audioBase64,
        audioMimeType: "audio/mpeg",
      });
    }

    // 3. Conversation Turn Generation (LLM or Deep Prompt Reasoner)
    let replyText = "";

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = OPENROUTER_DEFAULT_MODEL;

    // 3A. OpenRouter API (Primary - Gemini 2.5 Flash)
    if (openRouterKey && !replyText) {
      try {
        const promptLang =
          language === "hi"
            ? "Hindi"
            : language === "te"
            ? "Telugu"
            : language === "ta"
            ? "Tamil"
            : language === "kn"
            ? "Kannada"
            : language === "bn"
            ? "Bengali"
            : language === "mr"
            ? "Marathi"
            : language === "gu"
            ? "Gujarati"
            : language === "ml"
            ? "Malayalam"
            : language === "pa"
            ? "Punjabi"
            : "Indian English";

        const messages = [
          {
            role: "system",
            content: `${systemPrompt}\n\nCRITICAL FOR SPOKEN VOICE TELEPHONE CALL: You are on a live telephone voice call. Keep responses to 1-2 brief spoken sentences only (maximum 30 words). Respond naturally, politely, and fluently in ${promptLang} (${language}). Do NOT use markdown, bullet points, asterisks, reasoning, or lists. Speak directly as the voice assistant on the phone.`,
          },
          ...history.slice(-6).map((h: HistoryItem) => ({ role: h.role, content: h.content })),
          { role: "user", content: message },
        ];

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openRouterKey}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Sigulon Voice",
          },
          body: JSON.stringify({
            model: openRouterModel,
            temperature: 0.7,
            max_tokens: 1500,
            messages,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let rawReply = data.choices?.[0]?.message?.content?.trim() || "";
          rawReply = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

          // Fallback if content was empty due to reasoning output
          if (!rawReply && data.choices?.[0]?.message?.reasoning) {
            const r = data.choices[0].message.reasoning;
            const match = r.match(/["']([^"']{10,120})["']/);
            if (match) rawReply = match[1];
          }

          if (rawReply) {
            replyText = rawReply;
          }
        } else {
          console.warn("OpenRouter API error response:", res.status, await res.text());
        }
      } catch (e) {
        console.warn("OpenRouter fetch error:", e);
      }
    }
    // 3B. Keyword heuristic — dev-only playground fallback, never a
    // production answer. In production without an LLM key, fail loudly so
    // nobody mistakes canned replies for the agent (override with
    // ALLOW_HEURISTIC_FALLBACK=true for demos).
    if (!replyText) {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.ALLOW_HEURISTIC_FALLBACK !== "true"
      ) {
        return NextResponse.json(
          {
            error:
              "No LLM provider is configured for test sessions. Set OPENROUTER_API_KEY.",
          },
          { status: 503 }
        );
      }
      const lower = message.toLowerCase();

      // Extract specific business facts from the agent's system prompt
      const bizMatch = systemPrompt.match(/Business Overview:\s*([^\n]+)/i);
      const bizInfo = bizMatch ? bizMatch[1].trim() : "our business offerings";

      const goalMatch = systemPrompt.match(/Primary Goal:\s*([^\n]+)/i) ||
                        systemPrompt.match(/Call Objective[\s\S]*?-\s*([^\n]+)/i);
      const callGoal = goalMatch ? goalMatch[1].trim() : "schedule a consultation";

      const talkingMatch = systemPrompt.match(/Highlight the core offerings mentioned:\s*([^\n]+)/i) ||
                           systemPrompt.match(/Key Talking Points[\s\S]*?-\s*([^\n]+)/i);
      const offerings = talkingMatch ? talkingMatch[1].trim().replace(/\.$/, "") : bizInfo;

      const isAskingServices =
        lower.includes("what") ||
        lower.includes("service") ||
        lower.includes("do") ||
        lower.includes("kya") ||
        lower.includes("offer") ||
        lower.includes("help") ||
        lower.includes("kaise") ||
        lower.includes("seve") ||
        lower.includes("emi") ||
        lower.includes("property") ||
        lower.includes("solar") ||
        lower.includes("dental");

      const isAskingPrice =
        lower.includes("price") ||
        lower.includes("cost") ||
        lower.includes("pricing") ||
        lower.includes("kitna") ||
        lower.includes("rate") ||
        lower.includes("charges") ||
        lower.includes("fees") ||
        lower.includes("budget") ||
        lower.includes("dhara");

      const isAskingBooking =
        lower.includes("book") ||
        lower.includes("appointment") ||
        lower.includes("time") ||
        lower.includes("kal") ||
        lower.includes("slot") ||
        lower.includes("schedule") ||
        lower.includes("meet") ||
        lower.includes("visit") ||
        lower.includes("tour") ||
        lower.includes("samayam");

      const isGreeting =
        lower.includes("hello") ||
        lower.includes("namaste") ||
        lower.includes("namaskaram") ||
        lower.includes("hi") ||
        lower.includes("hey") ||
        lower.includes("kaise ho") ||
        lower.includes("bagunnara");

      const isAffirmative =
        lower.includes("yes") ||
        lower.includes("haan") ||
        lower.includes("theek") ||
        lower.includes("okay") ||
        lower.includes("sure") ||
        lower.includes("avunu") ||
        lower.includes("sari");

      const isAskingLocation =
        lower.includes("location") ||
        lower.includes("address") ||
        lower.includes("kahan") ||
        lower.includes("office") ||
        lower.includes("where") ||
        lower.includes("ekkada");

      if (isAskingServices) {
        if (language === "hi") {
          replyText = `हम मुख्य रूप से ${offerings} प्रदान करते हैं। हमारा उद्देश्य ${callGoal} है। क्या आप इसके बारे में विस्तार से जानना चाहेंगे?`;
        } else if (language === "te") {
          replyText = `మేము ${offerings} అందిస్తున్నాము. మా ముఖ్య ఉద్దేశం ${callGoal}. మీరు మరిన్ని వివరాలు తెలుసుకోవాలనుకుంటున్నారా?`;
        } else {
          replyText = `We specialize in ${offerings}. Our team is focused on helping you ${callGoal}. Would you like to know more about this?`;
        }
      } else if (isAskingPrice) {
        if (language === "hi") {
          replyText = `${offerings} के लिए हमारी दरें बहुत ही पारदर्शी और किफायती हैं। क्या मैं आपके बजट के अनुसार उपयुक्त विकल्प देखने के लिए कॉल तय करूँ?`;
        } else if (language === "te") {
          replyText = `${offerings} కోసం మా ధరలు చాలా అనుకూలంగా ఉంటాయి. మీ బడ్జెట్ ప్రకారం పూర్తి వివరాలు అందించడానికి సమయం కేటాయించనా?`;
        } else {
          replyText = `Our pricing for ${offerings} is very competitive and transparent. May I schedule a brief session to walk you through the options?`;
        }
      } else if (isAskingBooking) {
        if (language === "hi") {
          replyText = `हाँ, मैं बिल्कुल आपके लिए समय आरक्षित कर सकता हूँ। क्या कल सुबह 11 बजे का समय आपके लिए सुविधाजनक रहेगा?`;
        } else if (language === "te") {
          replyText = `తప్పకుండా, నేను మీ కోసం సమయం బుక్ చేయగలను. రేపు ఉదయం 11 గంటలకు మీకు వీలవుతుందా?`;
        } else {
          replyText = `Certainly! I would be delighted to schedule that for you. Would tomorrow morning at 11 AM work best for you?`;
        }
      } else if (isAffirmative) {
        if (language === "hi") {
          replyText = `बहुत बढ़िया! मैंने आपकी पुष्टि दर्ज कर ली है ताकि हम ${callGoal} कर सकें। क्या कोई और सवाल है जिसका मैं उत्तर दे सकूँ?`;
        } else if (language === "te") {
          replyText = `చాలా మంచిది! మీ నిర్ధారణ నమోదు చేయబడింది. మరేదైనా ప్రశ్న ఉందా?`;
        } else {
          replyText = `Wonderful! I have recorded your confirmation to ${callGoal}. Is there anything else you would like to clarify?`;
        }
      } else if (isGreeting) {
        if (language === "hi") {
          replyText = `नमस्ते! आपका बहुत स्वागत है। मैं ${bizInfo} के संबंध में आपकी सहायता करने के लिए उपस्थित हूँ। बताइए मैं क्या कर सकता हूँ?`;
        } else if (language === "te") {
          replyText = `నమస్కారం! స్వాగతం. నేను ${bizInfo} గురించి మీకు సహాయం చేయడానికి సిద్ధంగా ఉన్నాను. చెప్పండి నేను ఎలా సహాయపడగలను?`;
        } else {
          replyText = `Hello! Welcome. I am here to assist you regarding ${bizInfo}. How can I best help you today?`;
        }
      } else if (isAskingLocation) {
        if (language === "hi") {
          replyText = `हमारा केंद्रीय कार्यालय प्रमुख स्थान पर है, और हमारी टीम फोन और व्यक्तिगत दोनों रूप से उपलब्ध है। क्या आप कार्यालय आना पसंद करेंगे?`;
        } else if (language === "te") {
          replyText = `మా కార్యాలయం నగరంలో ఉంది మరియు మా బృందం అందుబాటులో ఉంది. మీరు వ్యక్తిగతంగా కలవాలనుకుంటున్నారా?`;
        } else {
          replyText = `Our office is centrally located and our team is ready to welcome you. Would you like to schedule an in-person visit?`;
        }
      } else {
        if (language === "hi") {
          replyText = `हाँ, मैं आपकी बात समझ गया। ${offerings} के संदर्भ में हम आपकी पूरी सहायता करेंगे। क्या आप अपना पसंदीदा समय बता सकते हैं?`;
        } else if (language === "te") {
          replyText = `నేను అర్థం చేసుకున్నాను. ${offerings} విషయంలో మేము మీకు పూర్తిగా సహాయం చేస్తాము. మీకు అనువైన సమయం చెప్పగలరా?`;
        } else {
          replyText = `I understand completely. Regarding ${offerings}, our team will ensure you get the best outcome. What time works best for you?`;
        }
      }
    }

    // 4. Synthesize voice with Cartesia Sonic-3
    const audioBuffer = await cartesia.generateSpeech({
      transcript: replyText,
      voiceId,
      language,
    });

    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

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
