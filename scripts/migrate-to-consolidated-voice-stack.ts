/**
 * Migration Script: Consolidate Database Voice Stack
 *
 * Target stack:
 * - LLM: LiveKit Inference -> "google/gemini-2.5-flash"
 * - STT: LiveKit Inference -> "deepgram/nova-3"
 * - TTS: Cartesia direct -> "sonic-3.6"
 *
 * Usage:
 *   npx vite-node scripts/migrate-to-consolidated-voice-stack.ts --dry-run
 *   npx vite-node scripts/migrate-to-consolidated-voice-stack.ts --apply
 */

import { connectToDatabase, AgentModel, AgentVersionModel } from "../packages/database";

const TARGET_STACK = {
  voice: {
    provider: "cartesia",
    model: "sonic-3.6",
  },
  intelligence: {
    provider: "livekit-inference",
    model: "google/gemini-2.5-flash",
  },
  speech: {
    sttProvider: "livekit-inference",
    sttModel: "deepgram/nova-3",
    ttsProvider: "cartesia",
    ttsModel: "sonic-3.6",
  },
};

interface MigrationStats {
  agentsInspected: number;
  agentsUpdated: number;
  versionsInspected: number;
  versionsUpdated: number;
}

async function runMigration() {
  const isApply = process.argv.includes("--apply");
  const isDryRun = process.argv.includes("--dry-run") || !isApply;

  console.log("==================================================");
  console.log("  SIGULON VOICE STACK CONSOLIDATION MIGRATION");
  console.log(`  Mode: ${isApply ? "APPLY (writing to database)" : "DRY RUN (no database writes)"}`);
  console.log("==================================================");
  console.log("Target Stack Specification:");
  console.log(`  - LLM: ${TARGET_STACK.intelligence.provider} (${TARGET_STACK.intelligence.model})`);
  console.log(`  - STT: ${TARGET_STACK.speech.sttProvider} (${TARGET_STACK.speech.sttModel})`);
  console.log(`  - TTS: ${TARGET_STACK.speech.ttsProvider} (${TARGET_STACK.speech.ttsModel})`);
  console.log("--------------------------------------------------");

  await connectToDatabase();
  console.log("Connected to MongoDB successfully.\n");

  const stats: MigrationStats = {
    agentsInspected: 0,
    agentsUpdated: 0,
    versionsInspected: 0,
    versionsUpdated: 0,
  };

  // 1. Migrate Agent records
  console.log("Inspecting Agents...");
  const agents = await AgentModel.find({}).exec();
  stats.agentsInspected = agents.length;

  for (const agent of agents) {
    const config = agent.config || ({} as Record<string, any>);
    let needsUpdate = false;
    const diffs: string[] = [];

    // Intelligence
    if (config.intelligence?.provider !== TARGET_STACK.intelligence.provider) {
      diffs.push(`intelligence.provider: "${config.intelligence?.provider}" -> "${TARGET_STACK.intelligence.provider}"`);
      needsUpdate = true;
    }
    if (config.intelligence?.model !== TARGET_STACK.intelligence.model) {
      diffs.push(`intelligence.model: "${config.intelligence?.model}" -> "${TARGET_STACK.intelligence.model}"`);
      needsUpdate = true;
    }

    // Speech STT
    if (config.speech?.sttProvider !== TARGET_STACK.speech.sttProvider) {
      diffs.push(`speech.sttProvider: "${config.speech?.sttProvider}" -> "${TARGET_STACK.speech.sttProvider}"`);
      needsUpdate = true;
    }
    if (config.speech?.sttModel !== TARGET_STACK.speech.sttModel) {
      diffs.push(`speech.sttModel: "${config.speech?.sttModel}" -> "${TARGET_STACK.speech.sttModel}"`);
      needsUpdate = true;
    }

    // Speech TTS
    if (config.speech?.ttsProvider !== TARGET_STACK.speech.ttsProvider) {
      diffs.push(`speech.ttsProvider: "${config.speech?.ttsProvider}" -> "${TARGET_STACK.speech.ttsProvider}"`);
      needsUpdate = true;
    }
    if (config.speech?.ttsModel !== TARGET_STACK.speech.ttsModel) {
      diffs.push(`speech.ttsModel: "${config.speech?.ttsModel}" -> "${TARGET_STACK.speech.ttsModel}"`);
      needsUpdate = true;
    }

    // Voice
    if (config.voice?.provider !== TARGET_STACK.voice.provider) {
      diffs.push(`voice.provider: "${config.voice?.provider}" -> "${TARGET_STACK.voice.provider}"`);
      needsUpdate = true;
    }
    if (config.voice?.model !== TARGET_STACK.voice.model) {
      diffs.push(`voice.model: "${config.voice?.model}" -> "${TARGET_STACK.voice.model}"`);
      needsUpdate = true;
    }

    if (needsUpdate) {
      stats.agentsUpdated++;
      console.log(`[Agent: ${agent.name} (${agent._id})]`);
      for (const d of diffs) {
        console.log(`   ${d}`);
      }

      if (isApply) {
        await AgentModel.updateOne(
          { _id: agent._id },
          {
            $set: {
              "config.intelligence.provider": TARGET_STACK.intelligence.provider,
              "config.intelligence.model": TARGET_STACK.intelligence.model,
              "config.speech.sttProvider": TARGET_STACK.speech.sttProvider,
              "config.speech.sttModel": TARGET_STACK.speech.sttModel,
              "config.speech.ttsProvider": TARGET_STACK.speech.ttsProvider,
              "config.speech.ttsModel": TARGET_STACK.speech.ttsModel,
              "config.voice.provider": TARGET_STACK.voice.provider,
              "config.voice.model": TARGET_STACK.voice.model,
            },
          }
        );
      }
    }
  }

  // 2. Migrate AgentVersion records
  console.log("\nInspecting AgentVersions...");
  const versions = await AgentVersionModel.find({}).exec();
  stats.versionsInspected = versions.length;

  for (const version of versions) {
    const config = version.config || ({} as Record<string, any>);
    let needsUpdate = false;
    const diffs: string[] = [];

    if (config.intelligence?.provider !== TARGET_STACK.intelligence.provider) {
      diffs.push(`intelligence.provider: "${config.intelligence?.provider}" -> "${TARGET_STACK.intelligence.provider}"`);
      needsUpdate = true;
    }
    if (config.intelligence?.model !== TARGET_STACK.intelligence.model) {
      diffs.push(`intelligence.model: "${config.intelligence?.model}" -> "${TARGET_STACK.intelligence.model}"`);
      needsUpdate = true;
    }
    if (config.speech?.sttProvider !== TARGET_STACK.speech.sttProvider) {
      diffs.push(`speech.sttProvider: "${config.speech?.sttProvider}" -> "${TARGET_STACK.speech.sttProvider}"`);
      needsUpdate = true;
    }
    if (config.speech?.sttModel !== TARGET_STACK.speech.sttModel) {
      diffs.push(`speech.sttModel: "${config.speech?.sttModel}" -> "${TARGET_STACK.speech.sttModel}"`);
      needsUpdate = true;
    }
    if (config.speech?.ttsProvider !== TARGET_STACK.speech.ttsProvider) {
      diffs.push(`speech.ttsProvider: "${config.speech?.ttsProvider}" -> "${TARGET_STACK.speech.ttsProvider}"`);
      needsUpdate = true;
    }
    if (config.speech?.ttsModel !== TARGET_STACK.speech.ttsModel) {
      diffs.push(`speech.ttsModel: "${config.speech?.ttsModel}" -> "${TARGET_STACK.speech.ttsModel}"`);
      needsUpdate = true;
    }
    if (config.voice?.provider !== TARGET_STACK.voice.provider) {
      diffs.push(`voice.provider: "${config.voice?.provider}" -> "${TARGET_STACK.voice.provider}"`);
      needsUpdate = true;
    }
    if (config.voice?.model !== TARGET_STACK.voice.model) {
      diffs.push(`voice.model: "${config.voice?.model}" -> "${TARGET_STACK.voice.model}"`);
      needsUpdate = true;
    }

    if (needsUpdate) {
      stats.versionsUpdated++;
      console.log(`[AgentVersion: v${version.versionNumber} for Agent ${version.agentId} (${version._id})]`);
      for (const d of diffs) {
        console.log(`   ${d}`);
      }

      if (isApply) {
        await AgentVersionModel.updateOne(
          { _id: version._id },
          {
            $set: {
              "config.intelligence.provider": TARGET_STACK.intelligence.provider,
              "config.intelligence.model": TARGET_STACK.intelligence.model,
              "config.speech.sttProvider": TARGET_STACK.speech.sttProvider,
              "config.speech.sttModel": TARGET_STACK.speech.sttModel,
              "config.speech.ttsProvider": TARGET_STACK.speech.ttsProvider,
              "config.speech.ttsModel": TARGET_STACK.speech.ttsModel,
              "config.voice.provider": TARGET_STACK.voice.provider,
              "config.voice.model": TARGET_STACK.voice.model,
            },
          }
        );
      }
    }
  }

  console.log("\n==================================================");
  console.log("  MIGRATION SUMMARY");
  console.log("==================================================");
  console.log(`Agents:        ${stats.agentsUpdated} / ${stats.agentsInspected} require update`);
  console.log(`AgentVersions: ${stats.versionsUpdated} / ${stats.versionsInspected} require update`);
  console.log(`Result:        ${isApply ? "Successfully updated database." : "DRY RUN complete — no changes were applied."}`);
  console.log("==================================================\n");

  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed with error:", err);
  process.exit(1);
});
