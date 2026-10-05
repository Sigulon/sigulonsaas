import mongoose, { Schema, Document, Model } from "mongoose";

export interface CanonicalAgentConfig {
  identity: {
    name: string;
    description: string;
    language: string;
  };
  instructions: {
    systemPrompt: string;
    greeting: string;
    fallbackBehavior?: string;
  };
  voice: {
    provider: string; // cartesia, etc.
    voiceId: string;
    model?: string;
    speed?: number;
  };
  intelligence: {
    provider: string; // livekit-inference
    model: string;
    temperature?: number;
  };
  speech: {
    sttProvider: string; // livekit-inference
    sttModel?: string;
    ttsProvider: string; // cartesia
    ttsModel?: string;
  };
  telephony: {
    provider: string; // plivo
  };
  tools: {
    enabledTools: string[];
    toolConfigs?: Record<string, unknown>;
  };
  settings: {
    interruptionHandling?: boolean;
    silenceTimeout?: number;
    maxCallDuration?: number;
    recordingEnabled?: boolean;
    pricing?: Record<string, unknown>;
    transferNumber?: string;
  };
  business?: {
    timezone?: string;
    workingHours?: {
      start: string;
      end: string;
      daysOfWeek: number[];
    };
  };
}

export interface IAgent extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  status: "draft" | "active" | "paused";
  currentVersionId?: mongoose.Types.ObjectId;
  publishedVersionNumber?: number;
  language: string; // top-level speech language (mirrors config.identity.language)
  greetingFirst: boolean; // inbound: greet first; outbound dial-out: false
  onNoBalance: "message" | "forward_number"; // zero-balance behavior
  forwardNumber?: string; // forward target when onNoBalance=forward_number
  config: CanonicalAgentConfig;
  description?: string | null;
  specification?: Record<string, unknown> | null;
  bundle?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const CanonicalAgentConfigSchema = new Schema<CanonicalAgentConfig>(
  {
    identity: {
      name: { type: String, required: true },
      description: { type: String, default: "" },
      language: { type: String, default: "hi" },
    },
    instructions: {
      systemPrompt: { type: String, required: true },
      greeting: { type: String, default: "" },
      fallbackBehavior: { type: String, default: "" },
    },
    voice: {
      provider: { type: String, default: "cartesia" },
      voiceId: { type: String, required: true },
      model: { type: String, default: "sonic-3.6" },
      speed: { type: Number, default: 1.0 },
    },
    intelligence: {
      provider: { type: String, default: "livekit-inference" },
      model: { type: String, default: "google/gemini-2.5-flash" },
      temperature: { type: Number, default: 0.7 },
    },
    speech: {
      sttProvider: { type: String, default: "livekit-inference" },
      sttModel: { type: String, default: "deepgram/nova-3" },
      ttsProvider: { type: String, default: "cartesia" },
      ttsModel: { type: String, default: "sonic-3.6" },
    },
    telephony: {
      provider: { type: String, default: "plivo" },
    },
    tools: {
      enabledTools: { type: [String], default: ["check_availability", "pricing_lookup"] },
      toolConfigs: { type: Schema.Types.Mixed, default: {} },
    },
    settings: {
      interruptionHandling: { type: Boolean, default: true },
      silenceTimeout: { type: Number, default: 10 },
      maxCallDuration: { type: Number, default: 600 },
      recordingEnabled: { type: Boolean, default: true },
      pricing: { type: Schema.Types.Mixed, default: {} },
      transferNumber: { type: String, default: "" },
    },
    business: {
      timezone: { type: String, default: "Asia/Kolkata" },
      workingHours: {
        start: { type: String, default: "09:00" },
        end: { type: String, default: "18:00" },
        daysOfWeek: { type: [Number], default: [1, 2, 3, 4, 5] },
      },
    },
  },
  { _id: false }
);

const AgentSchema = new Schema<IAgent>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused"],
      default: "draft",
      index: true,
    },
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "AgentVersion",
    },
    publishedVersionNumber: {
      type: Number,
      default: 0,
    },
    language: {
      type: String,
      default: "hi",
      index: true,
    },
    greetingFirst: {
      type: Boolean,
      default: true,
    },
    onNoBalance: {
      type: String,
      enum: ["message", "forward_number"],
      default: "message",
    },
    forwardNumber: {
      type: String,
      default: "",
    },
    config: {
      type: CanonicalAgentConfigSchema,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    specification: {
      type: Schema.Types.Mixed,
      default: null,
    },
    bundle: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "agents",
  }
);

AgentSchema.index({ organizationId: 1, status: 1 });

export const AgentModel: Model<IAgent> =
  mongoose.models.Agent || mongoose.model<IAgent>("Agent", AgentSchema);
