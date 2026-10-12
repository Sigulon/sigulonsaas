import type { VoiceAgent } from "./types";
import type { AgentBundle, CanonicalAgentConfig } from "@sigulon/agent-schema/schema";
import { VOICE_STACK } from "./voice-config";

// Compatibility export for callers migrating from the old local definition.
export type { CanonicalAgentConfig } from "@sigulon/agent-schema/schema";

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
      greeting_first: true,
      goals: settings.goals ?? [],
      rules: settings.rules ?? [],
    },
    voice: {
      provider: VOICE_STACK.TTS.PROVIDER,
      voice_id: agent.voice_id,
      language: agent.language,
      speed: settings.speed ?? 1.0,
    },
    intelligence: {
      provider: VOICE_STACK.LLM.PROVIDER,
      model: VOICE_STACK.LLM.MODEL,
    },
    speech: {
      stt_provider: VOICE_STACK.STT.PROVIDER,
      stt_model: VOICE_STACK.STT.MODEL,
      tts_provider: VOICE_STACK.TTS.PROVIDER,
      tts_model: VOICE_STACK.TTS.MODEL,
    },
    telephony: {
      provider: "livekit-sip",
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
