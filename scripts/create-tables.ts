import {
  connectToDatabase,
  ensureAllIndexes,
  UserModel,
  UserSessionModel,
  OrganizationModel,
  OrganizationMemberModel,
  AgentModel,
  AgentVersionModel,
  PhoneNumberModel,
  ContactModel,
  DncEntryModel,
  CampaignModel,
  CampaignContactModel,
  CallModel,
  CallEventModel,
  TranscriptModel,
  RecordingModel,
  CallOutcomeModel,
  AppointmentModel,
  ToolModel,
  ToolConfigModel,
  BillingAccountModel,
  CreditLedgerModel,
  UsageRecordModel,
  ProviderAccountModel,
  WebhookEventModel,
  ApiKeyModel,
  TeamInviteModel,
  AuditLogModel,
  NotificationModel,
} from "../packages/database";
import mongoose from "mongoose";

async function main() {
  console.log("================================================================");
  console.log("       SIGULON MONGODB — TABLE & INDEX INITIALIZATION");
  console.log("================================================================");

  const m = await connectToDatabase();
  const db = m.connection.db;
  if (!db) {
    throw new Error("Failed to obtain native db reference from Mongoose.");
  }

  console.log(`Connected to: ${m.connection.host}`);
  console.log(`Database:     ${db.databaseName}`);
  console.log("----------------------------------------------------------------");

  console.log("Creating all collections and compound indexes...");
  await ensureAllIndexes();
  console.log("All collections and indexes ensured successfully.");
  console.log("----------------------------------------------------------------");

  const models = [
    UserModel,
    UserSessionModel,
    OrganizationModel,
    OrganizationMemberModel,
    AgentModel,
    AgentVersionModel,
    PhoneNumberModel,
    ContactModel,
    DncEntryModel,
    CampaignModel,
    CampaignContactModel,
    CallModel,
    CallEventModel,
    TranscriptModel,
    RecordingModel,
    CallOutcomeModel,
    AppointmentModel,
    ToolModel,
    ToolConfigModel,
    BillingAccountModel,
    CreditLedgerModel,
    UsageRecordModel,
    ProviderAccountModel,
    WebhookEventModel,
    ApiKeyModel,
    TeamInviteModel,
    AuditLogModel,
    NotificationModel,
  ];

  console.log("Verifying collections in MongoDB database:\n");

  const existingCollections = await db.listCollections().toArray();
  const existingNames = new Set(existingCollections.map((c) => c.name));

  const tableData: Array<{
    Collection: string;
    Model: string;
    Status: string;
    Indexes: number;
    Documents: number;
  }> = [];

  for (const model of models) {
    const colName = model.collection.name;
    const exists = existingNames.has(colName);
    let indexCount = 0;
    let docCount = 0;
    if (exists) {
      try {
        const idx = await model.collection.indexes();
        indexCount = idx.length;
        docCount = await model.countDocuments();
      } catch {
        indexCount = 0;
      }
    }

    tableData.push({
      Collection: colName,
      Model: model.modelName,
      Status: exists ? "CREATED (OK)" : "MISSING",
      Indexes: indexCount,
      Documents: docCount,
    });
  }

  console.table(tableData);

  const missing = tableData.filter((r) => r.Status !== "CREATED (OK)");
  if (missing.length > 0) {
    console.error(`ERROR: ${missing.length} collections were not created!`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("================================================================");
  console.log(`SUCCESS: All ${models.length} collections and their indexes exist in MongoDB!`);
  console.log("================================================================");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
