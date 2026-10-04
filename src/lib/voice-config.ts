/**
 * Sigulon Voice Stack Configuration
 * Single Source of Truth for Voice Telephony Pipeline
 *
 * Approved Providers:
 * - LLM: Google Gemini 2.5 Flash via LiveKit Inference ("google/gemini-2.5-flash")
 * - STT: Deepgram Nova-3 via LiveKit Inference ("deepgram/nova-3")
 * - TTS: Cartesia Sonic 3.6 direct plugin ("sonic-3.6")
 */

export const VOICE_STACK = {
  LLM: {
    PROVIDER: "livekit-inference" as const,
    MODEL: "google/gemini-2.5-flash" as const,
  },
  STT: {
    PROVIDER: "livekit-inference" as const,
    MODEL: "deepgram/nova-3" as const,
  },
  TTS: {
    PROVIDER: "cartesia" as const,
    MODEL: "sonic-3.6" as const,
    SPEED_MIN: 0.6,
    SPEED_MAX: 1.5,
  },
} as const;

export type LlmProvider = typeof VOICE_STACK.LLM.PROVIDER;
export type LlmModel = typeof VOICE_STACK.LLM.MODEL;
export type SttProvider = typeof VOICE_STACK.STT.PROVIDER;
export type SttModel = typeof VOICE_STACK.STT.MODEL;
export type TtsProvider = typeof VOICE_STACK.TTS.PROVIDER;
export type TtsModel = typeof VOICE_STACK.TTS.MODEL;

export function clampVoiceSpeed(speed: number): number {
  if (typeof speed !== "number" || isNaN(speed)) return 1.0;
  return Math.max(VOICE_STACK.TTS.SPEED_MIN, Math.min(VOICE_STACK.TTS.SPEED_MAX, speed));
}
