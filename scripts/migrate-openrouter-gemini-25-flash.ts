import { AgentModel, connectToDatabase, disconnectDatabase } from "@sigulon/database";

const PROVIDER = "openrouter";
const MODEL = "google/gemini-2.5-flash";
const CARTESIA = "cartesia";
const CARTESIA_TTS_MODEL = "sonic-3";

async function main() {
  await connectToDatabase();

  const result = await AgentModel.updateMany(
    {
      $or: [
        { "config.intelligence.provider": { $ne: PROVIDER } },
        { "config.intelligence.model": { $ne: MODEL } },
        { "config.voice.provider": { $ne: CARTESIA } },
        { "config.voice.model": { $ne: CARTESIA_TTS_MODEL } },
        { "config.speech.sttProvider": { $ne: CARTESIA } },
        { "config.speech.ttsProvider": { $ne: CARTESIA } },
        { "config.speech.ttsModel": { $ne: CARTESIA_TTS_MODEL } },
      ],
    },
    {
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
    }
  );

  console.log(`Updated ${result.modifiedCount} agent configuration(s) to OpenRouter ${MODEL} with Cartesia STT/TTS.`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error("Gemini 2.5 Flash migration failed:", error);
  await disconnectDatabase();
  process.exit(1);
});
