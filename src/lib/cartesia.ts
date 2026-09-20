import crypto from "crypto";
import { CartesiaVoicePreset } from "./types";

export interface IndianLanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const INDIAN_LANGUAGES: IndianLanguageOption[] = [
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "od", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { code: "as", name: "Assamese", nativeName: "অসমীয়া" },
  { code: "en", name: "Indian English (Hinglish)", nativeName: "Indian English" },
];

export const CARTESIA_VOICE_PRESETS: CartesiaVoicePreset[] = [
  {
    id: "126a0835-beea-4e77-a883-f66eabcf6dd4",
    name: "Swati (Hindi - Clear & Approachable)",
    gender: "female",
    accent: "Hindi - Professional",
    description: "Clear, approachable Hindi delivery ideal for support, recall, and appointment booking.",
  },
  {
    id: "cf061d8b-a752-4865-81a2-57570a6e0565",
    name: "Ramya (Telugu - Graceful Host)",
    gender: "female",
    accent: "Telugu - Warm",
    description: "Warm, welcoming Telugu native speaker that puts callers at ease immediately.",
  },
  {
    id: "72656902-fb4b-4c31-af52-c3b68e2cae26",
    name: "Esha (Hindi - Calm Guide)",
    gender: "female",
    accent: "Hindi - Reassuring",
    description: "Soft, reassuring Hindi voice great for care updates, reminders, and sensitive calls.",
  },
  {
    id: "56e35e2d-6eb6-4226-ab8b-9776515a7094",
    name: "Kavita (Hindi - Customer Care Agent)",
    gender: "female",
    accent: "Hindi - Conversational",
    description: "Experienced Indian female voice for enterprise customer care and outbound calling.",
  },
  {
    id: "adf97b9d-905c-41de-9fe9-afb387116d06",
    name: "Vikas (Hindi - Polite Specialist)",
    gender: "male",
    accent: "Hindi - Formal",
    description: "Polite, friendly Indian male voice for customer support and business development.",
  },
  {
    id: "791d5162-d5eb-40f0-8189-f19db44611d8",
    name: "Ayush (Hindi - Friendly Neighbor)",
    gender: "male",
    accent: "Hindi - Energetic",
    description: "Confident, energetic Indian male voice for sales discovery and demos.",
  },
  {
    id: "1259b7e3-cb8a-43df-9446-30971a46b8b0",
    name: "Devansh (Indian English - Warm Support)",
    gender: "male",
    accent: "Indian English - Neutral",
    description: "Warm, conversational Indian English accent for natural corporate communication.",
  },
  {
    id: "f8f5f1b2-f02d-4d8e-a40d-fd850a487b3d",
    name: "Kiara (Indian English - Joyful)",
    gender: "female",
    accent: "Indian English - Clear",
    description: "Upbeat, articulated Indian accented female for engaging outbound customer campaigns.",
  },
  {
    id: "fd2ada67-c2d9-4afe-b474-6386b87d8fc3",
    name: "Ishan (Hinglish - Conversational Ally)",
    gender: "male",
    accent: "Hinglish - Bilingual",
    description: "Conversational male for bilingual Hindi-English sales and support.",
  },
  {
    id: "47f3bbb1-e98f-4e0c-92c5-5f0325e1e206",
    name: "Neha (Hindi - Virtual Assistant)",
    gender: "female",
    accent: "Hindi - System Assistant",
    description: "Clear, composed female voice for virtual assistants and IVR system prompts.",
  },
  {
    id: "c63361f8-d142-4c62-8da7-8f8149d973d6",
    name: "Krishna (Indian English - Friendly Pal)",
    gender: "male",
    accent: "Indian English - Casual",
    description: "Easygoing Indian male voice with natural cadence for everyday interactions.",
  },
  {
    id: "838180da-8b92-4a49-aa6c-a987377fbb7f",
    name: "Cartesia Sonic Custom (Active Line)",
    gender: "female",
    accent: "Indian Multilingual",
    description: "Your active Cartesia Sonic voice model deployed on your agent.",
  },
];

interface CartesiaAgentParams {
  name: string;
  voiceId: string;
  language?: string;
  systemPrompt: string;
  introduction?: string;
}


export class CartesiaClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CARTESIA_API_KEY || "";
    this.baseUrl = process.env.CARTESIA_BASE_URL || "https://api.cartesia.ai";
  }

  /**
   * Fetch all real agents created on this Cartesia account
   */
  async listAgents(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    tts_voice: string;
    tts_language: string;
    llm_system_prompt?: string;
    llm_introduce?: string;
    phone_numbers?: Array<{ id: string; number: string }>;
    created_at?: string;
  }>> {
    if (!this.apiKey) return [];

    const response = await fetch(`${this.baseUrl}/agents`, {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cartesia API Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.summaries || data.agents || [];
  }

  /**
   * Fetch single agent by ID from Cartesia
   */
  async getAgent(agentId: string) {
    const response = await fetch(`${this.baseUrl}/agents/${agentId}`, {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cartesia API Error (${response.status}): ${err}`);
    }

    return await response.json();
  }

  /**
   * Create an AI Voice Agent in Cartesia
   */
  async createAgent(params: CartesiaAgentParams): Promise<{ agent_id: string }> {
    // Cartesia requires name to match /^[a-z0-9_\-.]+$/
    const sanitizedName = params.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_\-.]+/g, "-")
      .replace(/^-+|-+$/g, "") || `agent-${Date.now()}`;

    const response = await fetch(`${this.baseUrl}/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        name: sanitizedName,
        tts_voice: params.voiceId,
        tts_language: params.language || "hi",
        llm_system_prompt: params.systemPrompt,
        llm_introduce: params.introduction || "",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      let parsedErr: { message?: string } | null = null;
      try {
        parsedErr = JSON.parse(err);
      } catch {}

      if (response.status === 402 || parsedErr?.message?.includes("Agent limit reached")) {
        throw new Error(
          parsedErr?.message || "Cartesia subscription agent limit reached. Please upgrade your Cartesia plan or manage your existing agent."
        );
      }
      throw new Error(`Cartesia Agent Creation Failed (${response.status}): ${err}`);
    }

    const data = await response.json();
    return { agent_id: data.id || data.agent_id };
  }

  /**
   * Update an existing AI Voice Agent in Cartesia
   */
  async updateAgent(cartesiaAgentId: string, params: Partial<CartesiaAgentParams>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.name) {
      body.name = params.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_\-.]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    if (params.systemPrompt !== undefined) body.llm_system_prompt = params.systemPrompt;
    if (params.introduction !== undefined) body.llm_introduce = params.introduction;
    if (params.voiceId) body.tts_voice = params.voiceId;
    if (params.language) body.tts_language = params.language;

    const response = await fetch(`${this.baseUrl}/agents/${cartesiaAgentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cartesia API Error (${response.status}): ${err}`);
    }
  }

  /**
   * Generate live Speech Audio via Cartesia Sonic-3 for in-browser testing
   */
  async generateSpeech(params: {
    transcript: string;
    voiceId: string;
    language?: string;
  }): Promise<ArrayBuffer> {
    const response = await fetch(`${this.baseUrl}/tts/bytes`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-3",
        transcript: params.transcript,
        voice: {
          mode: "id",
          id: params.voiceId,
        },
        language: params.language || "hi",
        output_format: {
          container: "mp3",
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cartesia TTS Error (${response.status}): ${err}`);
    }

    return await response.arrayBuffer();
  }

  /**
   * Provision a virtual telephone number via Cartesia
   *
   * @param areaCode - US area code (e.g. "555"). Only used for US numbers.
   * @param country  - ISO 3166-1 alpha-2 country code (default: "US").
   *                   Note: Indian (IN) telephony is not currently available
   *                   through the Cartesia API. Non-US requests may fail.
   */
  async provisionPhoneNumber(areaCode = "555", country = "US"): Promise<{ number_id: string; phone_number: string }> {
    const response = await fetch(`${this.baseUrl}/telephony/numbers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        area_code: areaCode,
        country,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cartesia Telephony Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return {
      number_id: data.id,
      phone_number: data.phone_number,
    };
  }



  /**
   * Verify HMAC-SHA256 signature for incoming webhooks
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
    if (!signatureHeader || !webhookSecret) return false;

    try {
      const hmac = crypto.createHmac("sha256", webhookSecret);
      const digest = "sha256=" + hmac.update(rawBody).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(digest));
    } catch {
      return false;
    }
  }
}

export const defaultCartesiaClient = new CartesiaClient();
