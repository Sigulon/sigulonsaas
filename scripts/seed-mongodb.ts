/**
 * Database Seed Script — DEMO DATA REMOVED
 *
 * Mockup and demo data have been completely removed.
 * To ensure database canonical indexes and collections are created without any mock data,
 * run:
 *   npm run db:init
 */

import { connectToDatabase, ensureAllIndexes } from "../packages/database";

async function main() {
  console.log("==================================================");
  console.log("  SIGULON DATABASE INITIALIZATION (NO DEMO DATA)");
  console.log("==================================================");

  await connectToDatabase();
  console.log("Connected to MongoDB successfully.");

  console.log("Ensuring all canonical compound indexes...");
  await ensureAllIndexes();
  console.log("Compound indexes ensured. Zero demo data inserted.");
}

main().catch((err) => {
  console.error("Initialization error:", err);
  process.exit(1);
});
