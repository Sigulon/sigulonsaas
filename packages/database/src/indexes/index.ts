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
      await model.syncIndexes();
    } catch (err) {
      console.warn(`[database/indexes] Warning syncing indexes for ${model.modelName}:`, err);
    }
  }
}
