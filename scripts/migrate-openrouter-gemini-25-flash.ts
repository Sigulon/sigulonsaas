import { AgentModel, connectToDatabase, disconnectDatabase } from "@sigulon/database";

const PROVIDER = "openrouter";
const MODEL = "google/gemini-2.5-flash";
const CARTESIA = "cartesia";
const CARTESIA_TTS_MODEL = "sonic-3";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  const orgArg = args.find((a) => a.startsWith("--org="))?.slice("--org=".length);

  await connectToDatabase();

  const filter: Record<string, unknown> = {
    $or: [
      { "config.intelligence.provider": { $ne: PROVIDER } },
      { "config.intelligence.model": { $ne: MODEL } },
      { "config.voice.provider": { $ne: CARTESIA } },
      { "config.voice.model": { $ne: CARTESIA_TTS_MODEL } },
      { "config.speech.sttProvider": { $ne: CARTESIA } },
      { "config.speech.ttsProvider": { $ne: CARTESIA } },
      { "config.speech.ttsModel": { $ne: CARTESIA_TTS_MODEL } },
    ],
  };
  if (orgArg) filter.organizationId = orgArg;

  const patch = {
    $set: {
      "config.intelligence.provider": PROVIDER,
      "config.intelligence.model": MODEL,
      "config.voice.provider": CARTESIA,
      "config.voice.model": CARTESIA_TTS_MODEL,
      "config.speech.sttProvider": CARTESIA,
      "config.speech.sttModel": "ink-whisper",
      "config.speech.ttsProvider": CARTESIA,
      "config.speech.ttsModel": CARTESIA_TTS_MODEL,
    },
  };

  const preview = await AgentModel.find(filter, { _id: 1, organizationId: 1, name: 1 }).lean().exec();
  console.log(
    `${dryRun ? "[dry-run] Would update" : "Updating"} ${preview.length} agent(s)` +
    (orgArg ? ` in org ${orgArg}` : " across all orgs") +
    " — no AgentVersion snapshots are created by this script; re-publish affected agents afterwards."
  );
  if (dryRun) {
    for (const a of preview.slice(0, 20)) {
      console.log(`  - ${String((a as { _id?: unknown })._id)} ${(a as { name?: string }).name ?? ""}`);
    }
    if (preview.length > 20) console.log(`  ... and ${preview.length - 20} more. Re-run with --apply to write.`);
    await disconnectDatabase();
    return;
  }

  const result = await AgentModel.updateMany(filter, patch);

  console.log(`Updated ${result.modifiedCount} agent configuration(s) to OpenRouter ${MODEL} with Cartesia STT/TTS.`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error("Gemini 2.5 Flash migration failed:", error);
  await disconnectDatabase();
  process.exit(1);
});
