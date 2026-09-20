import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { INDIAN_LANGUAGES } from "@/lib/cartesia";
import { buildSystemPrompt } from "@/lib/prompt-builder";
import { OPENROUTER_DEFAULT_MODEL } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { role } = await getOrgContext();
    if (!canCreateAndRun(role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const body = await req.json();
    const { business_description, language = "hi", goal } = body;

    if (!business_description) {
      return NextResponse.json(
        { error: "business_description is required" },
        { status: 400 }
      );
    }

    const langObj = INDIAN_LANGUAGES.find((l) => l.code === language) || {
      name: "Hindi",
      nativeName: "हिन्दी",
    };

    // Use OpenRouter Gemini 2.5 Flash when available.
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = OPENROUTER_DEFAULT_MODEL;

    if (openRouterKey) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Sigulon Voice",
        };

        const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(4000),
          body: JSON.stringify({
            model: openRouterModel,
            temperature: 0.7,
            messages: [
              {
                role: "system",
                content: `You are helping structure a voice AI agent's system prompt for a business.
Given a business description, output a structured prompt with these sections:
- Role & Identity (who the agent is, on behalf of what business)
- Tone & Style (formal/casual, pace, language register in ${langObj.name})
- Call Objective (what a successful call looks like)
- Key Talking Points (services, pricing if mentioned, USPs)
- Constraints (what NOT to say/do, e.g. no legal/medical advice, no price commitments if not given)
- Call-Ending Conditions (when/how to end the call, escalation to human if needed)
Output ONLY the structured prompt text, no preamble.`,
              },
              {
                role: "user",
                content: `Business description: "${business_description}"
${goal ? `Primary Call Goal: "${goal}"` : ""}
Target language: ${langObj.name} (${language})`,
              },
            ],
          }),
        });

        if (llmRes.ok) {
          const llmData = await llmRes.json();
          const content = llmData.choices?.[0]?.message?.content;
          if (content) {
            return NextResponse.json({ structured_prompt: content });
          }
        }
      } catch (err) {
        console.warn("LLM API call failed, using built-in structuring engine:", err);
      }
    }

    // High quality built-in structuring engine (canonical template).
    const promptText = buildSystemPrompt({
      businessDescription: business_description,
      language,
      goal,
    });

    return NextResponse.json({ structured_prompt: promptText });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to generate prompt";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
