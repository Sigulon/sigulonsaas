/**
 * Migration Script: Migrate Legacy Agents to Unified Agent Bundle v2
 *
 * Wraps legacy agent configs without bundles or invalid bundles into minimal valid bundles:
 * - Order 1: Greeting section (edges -> faqs, close)
 * - Order 2: Mandatory FAQs section (edges: null) with required exact instruction
 * - Order 3: Close section (edges: null)
 * - Required phone & lead_name variables
 *
 * Usage:
 *   npx vite-node scripts/migrate-agents-to-bundle-v2.ts --dry-run
 *   npx vite-node scripts/migrate-agents-to-bundle-v2.ts --apply
 */

import { connectToDatabase, AgentModel } from "../packages/database";
import { validateAgentBundle } from "../src/lib/agent-bundle/validator";
import { compileBundleToSystemPrompt } from "../src/lib/agent-bundle/compiler";
import { AgentBundle } from "../src/lib/agent-bundle/schema";

async function runMigration() {
  const isApply = process.argv.includes("--apply");
  const isDryRun = !isApply;

  console.log("==================================================");
  console.log("  SIGULON AGENT BUNDLE V2 MIGRATION");
  console.log(`  Mode: ${isApply ? "APPLY (writing to database)" : "DRY RUN (no database writes)"}`);
  console.log("==================================================");

  await connectToDatabase();
  console.log("Connected to MongoDB successfully.\n");

  const agents = await AgentModel.find({});
  console.log(`Found ${agents.length} agent(s) to inspect.\n`);

  let inspected = 0;
  let alreadyValid = 0;
  let migrated = 0;

  for (const agent of agents) {
    inspected++;
    const name = agent.name || "AI Agent";
    const existingBundle = agent.bundle;

    if (existingBundle && typeof existingBundle === "object") {
      const validation = validateAgentBundle(existingBundle);
      if (validation.valid) {
        console.log(`[PASS] Agent "${name}" (${agent._id}) already has valid bundle v2.`);
        alreadyValid++;
        continue;
      }
    }

    console.log(`[MIGRATE] Agent "${name}" (${agent._id}) lacks a valid bundle v2. Constructing minimal bundle...`);

    const lang = agent.config?.identity?.language || agent.language || "te-IN";
    const isTelugu = lang.startsWith("te");
    const isHindi = lang.startsWith("hi");

    const minimalBundle: AgentBundle = {
      bundle_version: 2,
      exported_from: {
        employee_name: name,
        employee_role: agent.description || "Customer Relationship Executive",
        mode: "bulk",
        language: lang,
      },
      first_response:
        agent.config?.instructions?.greeting ||
        (isTelugu
          ? "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా?"
          : isHindi
          ? "नमस्ते, क्या मैं {{lead_name}} जी से बात कर रहा हूँ?"
          : "Hello, am I speaking with {{lead_name}}?"),
      sections: [
        {
          section_key: "greeting_purpose",
          label: "Greeting & Purpose",
          order: 1,
          enabled: true,
          node_type: "llm",
          edges: [
            {
              to_key: "faqs",
              condition: "if customer asks questions about the service or business",
            },
            {
              to_key: "close",
              condition: "if caller is busy, declines, or call concludes",
            },
          ],
          prompt: isTelugu
            ? `Introduce yourself as ${name} and explain the purpose of your call politely. For example you might say: 'నమస్తే అండి, నేను ${name} మాట్లాడుతున్నాను. ఒక్క నిమిషం మాట్లాడవచ్చా అండి?'`
            : `Introduce yourself as ${name} and state the purpose of your call politely. For example you might say: 'Hello, this is ${name}. Is this a good time to speak?'`,
        },
        {
          section_key: "faqs",
          label: "Business FAQs",
          order: 2,
          enabled: true,
          node_type: "llm",
          edges: null,
          prompt: isTelugu
            ? `Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.\n\nQ: వివరాలు ఎలా పంపుతారు?\nA: మీ నెంబర్ {{phone}} కి వాట్సాప్ ద్వారా పంపిస్తాము.\n\nFor example you might say: 'ఖచ్చితంగా అండి, పూర్తి వివరాలు మా టీమ్ మీకు అందిస్తుంది.'`
            : `Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.\n\nQ: How will you send details?\nA: We will send them directly to your phone {{phone}} on WhatsApp.\n\nFor example you might say: 'Certainly, we will share all details with you right away.'`,
        },
        {
          section_key: "close",
          label: "Call Wrap Up",
          order: 3,
          enabled: true,
          node_type: "llm",
          edges: null,
          prompt: isTelugu
            ? `Thank the customer warmly for their time. Do not introduce any new questions. For example you might say: 'చాలా థ్యాంక్స్ అండి మీ సమయం ఇచ్చినందుకు. హావ్ ఏ గ్రేట్ డే!'`
            : `Thank the customer warmly and conclude the conversation politely. For example you might say: 'Thank you for your time. Have a wonderful day!'`,
        },
      ],
      variables: [
        {
          key: "phone",
          label: "Phone Number",
          source: "pre",
          required: true,
          is_phone: true,
          is_lead_name: false,
          is_headline: false,
          value_type: "text",
          choices: null,
          extract_hint: null,
        },
        {
          key: "lead_name",
          label: "Lead Name",
          source: "pre",
          required: false,
          is_phone: false,
          is_lead_name: true,
          is_headline: true,
          value_type: "text",
          choices: null,
          extract_hint: null,
        },
      ],
    };

    const validation = validateAgentBundle(minimalBundle);
    if (!validation.valid) {
      console.error(`  [ERROR] Generated minimal bundle failed validation:`, validation.errors);
      continue;
    }

    if (isApply) {
      agent.bundle = minimalBundle;
      agent.markModified("bundle");

      const compiledPrompt = compileBundleToSystemPrompt(minimalBundle);
      if (agent.config) {
        agent.config.instructions.systemPrompt = compiledPrompt;
        agent.config.instructions.greeting = minimalBundle.first_response;
        agent.markModified("config");
      }

      await agent.save();
      console.log(`  [UPDATED] Successfully updated agent "${name}" with bundle v2.`);
      migrated++;
    } else {
      console.log(`  [DRY-RUN] Would update agent "${name}" with minimal bundle v2.`);
      migrated++;
    }
  }

  console.log("\n==================================================");
  console.log("  MIGRATION SUMMARY");
  console.log("==================================================");
  console.log(`  Inspected:      ${inspected}`);
  console.log(`  Already valid:  ${alreadyValid}`);
  console.log(`  ${isApply ? "Migrated:      " : "Needs migration:"} ${migrated}`);
  console.log("==================================================");

  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
