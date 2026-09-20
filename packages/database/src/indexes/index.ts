import { connectToDatabase } from "../client";
import {
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
} from "../models";

export async function ensureAllIndexes(): Promise<void> {
  await connectToDatabase();

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

  for (const model of models) {
    try {
      await model.createCollection();
      // Create-only: never drop indexes here. syncIndexes() would silently
      // delete manually-added operational indexes (TTL, text, hotfix
      // compounds) whenever seed/create-tables runs against a live DB.
      await model.ensureIndexes();
    } catch (err) {
      console.warn(`[database/indexes] Warning ensuring indexes for ${model.modelName}:`, err);
    }
  }
}
