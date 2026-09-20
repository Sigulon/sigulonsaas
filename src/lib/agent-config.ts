import type { VoiceAgent } from "./types";
import type { AgentBundle } from "@sigulon/agent-schema/schema";
import {
  CARTESIA_STT_PROVIDER,
  CARTESIA_TTS_MODEL,
  CARTESIA_TTS_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "./types";

/**
 * Canonical agent configuration (spec §7) — the single contract shared by
 * the Next.js control plane and the Python voice runtime.
 *
 * The voice runtime caches exactly this shape in Redis under
 * `callConfigCacheKey(callId)` and builds its Pipecat pipeline from it.
 * Any field added here must also be added to the runtime's Pydantic model
 * (`voice-runtime/config.py` → `to_canonical` / `from_canonical`).
 */
export interface CanonicalAgentConfig {
  id: string;
  organization_id: string;
  /** Filled at call time (pre-warm / inbound webhook), never stored. */
  call_id?: string;
  direction?: "inbound" | "outbound";

  identity: {
    name: string;
    company: string;
  };

  instructions: {
    system_prompt: string;
    introduction?: string | null;
    goals: string[];
    rules: string[];
  };

  voice: {
    provider: string;
    voice_id: string;
    language: string;
    speed: number;
  };

  intelligence: {
    provider: string;
    model: string;
  };

  speech: {
    stt_provider: string;
    stt_model?: string | null;
    tts_provider: string;
    tts_model: string;
  };

  telephony: {
    provider: string;
    phone_number_id?: string | null;
  };

  tools: string[];

  settings: {
    max_call_duration_seconds: number;
    silence_timeout_seconds: number;
    record_calls: boolean;
  };

  /** Source-of-truth conversation bundle consumed by the voice runtime. */
  bundle?: AgentBundle | null;
}

export interface AgentConfigSettings {
  max_call_duration_seconds?: number;
  silence_timeout_seconds?: number;
  record_calls?: boolean;
  speed?: number;
  tts_provider?: string;
  goals?: string[];
  rules?: string[];
}

/** Redis key for the per-call config cache. Must match `CALL_CONFIG_KEY` in `voice-runtime/config.py`. */
export function callConfigCacheKey(callId: string): string {
  return `sigulon:call:${callId}:config`;
}

/**
 * Build the canonical config from a `voice_agents` row. Pure function —
 * used by API routes today and by the call pre-warm path (Phase 5).
 */
export function toCanonicalAgentConfig(
  agent: VoiceAgent,
  company: string,
  overrides?: Partial<CanonicalAgentConfig>
): CanonicalAgentConfig {
  const settings = (agent.settings ?? {}) as AgentConfigSettings;
  const {
    voice: _voiceOverride,
    intelligence: _intelligenceOverride,
    speech: _speechOverride,
    ...safeOverrides
  } = overrides ?? {};
  return {
    id: agent.id,
    organization_id: agent.org_id,
    identity: {
      name: agent.name,
      company,
    },
    instructions: {
      system_prompt: agent.system_prompt,
      introduction: agent.introduction ?? null,
      goals: settings.goals ?? [],
      rules: settings.rules ?? [],
    },
    voice: {
      provider: CARTESIA_TTS_PROVIDER,
      voice_id: agent.voice_id,
      language: agent.language,
      speed: settings.speed ?? 1.0,
    },
    intelligence: {
      provider: "openrouter",
      model: OPENROUTER_DEFAULT_MODEL,
    },
    speech: {
      stt_provider: CARTESIA_STT_PROVIDER,
      stt_model: null,
      tts_provider: CARTESIA_TTS_PROVIDER,
      tts_model: CARTESIA_TTS_MODEL,
    },
    telephony: {
      provider: "plivo",
      phone_number_id: null,
    },
    tools: agent.enabled_tools ?? [],
    settings: {
      max_call_duration_seconds: settings.max_call_duration_seconds ?? 1800,
      silence_timeout_seconds: settings.silence_timeout_seconds ?? 20,
      record_calls: settings.record_calls ?? true,
    },
    bundle: (agent.bundle as AgentBundle | null | undefined) ?? null,
    ...safeOverrides,
  };
}
