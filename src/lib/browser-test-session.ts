import { z } from "zod";
import type { IAgent } from "@sigulon/database";
import { toCanonicalAgentConfig } from "./agent-config";
import { AgentBundleSchema, type AgentBundle } from "./agent-bundle/schema";

export const mongoId = z.string().regex(/^[a-f\d]{24}$/i);
export const testSessionRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("init"),
    voiceId: z.string().uuid().optional(),
    language: z.enum(["te", "hi", "en", "ta", "kn", "mr", "bn", "gu", "ml", "pa", "hinglish", "te-IN", "hi-IN", "en-IN", "en-US", "en-GB", "ta-IN", "kn-IN", "mr-IN", "bn-IN", "gu-IN", "ml-IN", "pa-IN"]).optional(),
    systemPrompt: z.string().trim().min(1).max(50000).optional(),
    bundle: AgentBundleSchema.optional(),
  }).strict(),
  z.object({ action: z.literal("end_call"), callId: mongoId }).strict(),
]);

export function browserTestConfig(
  agent: Pick<IAgent, "_id" | "name" | "config" | "status" | "bundle" | "createdAt" | "updatedAt">,
  orgId: string,
  company: string,
  callId: string,
  overrides: { voiceId?: string; language?: string; systemPrompt?: string; bundle?: AgentBundle },
) {
  const config = agent.config;
  const promptChanged = overrides.systemPrompt !== undefined &&
    overrides.systemPrompt.trim() !== config.instructions.systemPrompt.trim();
  const bundle = overrides.bundle ?? (promptChanged ? null : agent.bundle as AgentBundle | null | undefined);
  const language = overrides.language ?? bundle?.exported_from?.language ?? config.identity.language;
  const canonical = toCanonicalAgentConfig({
    id: agent._id.toString(), org_id: orgId, name: agent.name,
    status: agent.status,
    voice_id: overrides.voiceId ?? config.voice.voiceId,
    language,
    system_prompt: overrides.systemPrompt ?? config.instructions.systemPrompt,
    introduction: bundle?.first_response ?? config.instructions.greeting,
    enabled_tools: config.tools.enabledTools,
    settings: {
      speed: config.voice.speed,
      max_call_duration_seconds: config.settings.maxCallDuration,
      silence_timeout_seconds: config.settings.silenceTimeout,
      record_calls: config.settings.recordingEnabled,
    },
    // A compiled bundle otherwise supersedes the explicit draft prompt in Python.
    bundle,
    created_at: agent.createdAt.toISOString(), updated_at: agent.updatedAt.toISOString(),
  }, company, { call_id: callId, direction: "inbound" });
  if (canonical.bundle) {
    canonical.bundle = {
      ...canonical.bundle,
      exported_from: { ...canonical.bundle.exported_from, language,
        languages: [language, ...(canonical.bundle.exported_from.languages ?? []).filter((item) => item !== language)],
      },
    };
  }
  return canonical;
}

export function isRoomMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; status?: number };
  return e.code === "not_found" || e.status === 404;
}
