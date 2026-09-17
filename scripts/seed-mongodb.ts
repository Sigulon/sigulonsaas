import {
  connectToDatabase,
  ensureAllIndexes,
  UserModel,
  OrganizationModel,
  OrganizationMemberModel,
  BillingAccountModel,
  CreditLedgerModel,
  PhoneNumberModel,
  AgentModel,
  AgentVersionModel,
  ContactModel,
  DncEntryModel,
  CampaignModel,
  CampaignContactModel,
  CallModel,
  TranscriptModel,
  CallOutcomeModel,
  AppointmentModel,
  AuditLogModel,
} from "../packages/database";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

async function main() {
  console.log("==================================================");
  console.log("  SIGULON MONGODB PRODUCTION SEEDING SCRIPT");
  console.log("==================================================");

  await connectToDatabase();
  console.log("Connected to MongoDB successfully.");

  console.log("Ensuring all canonical compound indexes...");
  await ensureAllIndexes();
  console.log("Compound indexes created successfully.");

  // 1. Create or update Demo Admin User
  const demoEmail = "demo@sigulon.ai";
  let user = await UserModel.findOne({ email: demoEmail });
  if (!user) {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    user = new UserModel({
      email: demoEmail,
      passwordHash,
      name: "Sigulon Demo Admin",
      isEmailVerified: true,
      createdAt: new Date(),
    });
    await user.save();
    console.log(`Created demo user: ${user.email} (ID: ${user._id})`);
  } else {
    console.log(`Demo user already exists: ${user.email}`);
  }

  // 2. Create or update Organization
  let org = await OrganizationModel.findOne({ slug: "acme-voice-corp" });
  if (!org) {
    org = new OrganizationModel({
      name: "Acme Voice & Real Estate Corp",
      slug: "acme-voice-corp",
      maxConcurrentCalls: 10,
      complianceSettings: {
        enforceDnc: true,
        recordCalls: true,
        restrictedHours: {
          start: "21:00",
          end: "09:00",
          timezone: "Asia/Kolkata",
        },
      },
    });
    await org.save();
    console.log(`Created organization: ${org.name} (ID: ${org._id})`);
  } else {
    console.log(`Organization already exists: ${org.name}`);
  }

  // 3. Ensure Organization Membership
  let member = await OrganizationMemberModel.findOne({
    organizationId: org._id,
    userId: user._id,
  });
  if (!member) {
    member = new OrganizationMemberModel({
      organizationId: org._id,
      userId: user._id,
      role: "owner",
    });
    await member.save();
    console.log(`Added user ${user.email} as 'owner' of ${org.name}`);
  }

  // 4. Create Billing Account and initial credit deposit
  let billing = await BillingAccountModel.findOne({ organizationId: org._id });
  if (!billing) {
    billing = new BillingAccountModel({
      organizationId: org._id,
      balanceCredits: 500.0,
      reservedCredits: 0.0,
      currency: "INR",
    });
    await billing.save();
    console.log(`Provisioned Billing Account with 500 credits.`);
  }

  let ledger = await CreditLedgerModel.findOne({ organizationId: org._id });
  if (!ledger) {
    ledger = new CreditLedgerModel({
      organizationId: org._id,
      type: "credit_grant",
      amount: 500.0,
      balanceAfter: 500.0,
      referenceType: "admin",
      metadata: { description: "Initial platform welcome credit deposit" },
      idempotencyKey: `seed:welcome:${org._id}`,
    });
    await ledger.save();
    console.log(`Recorded welcome credit grant in CreditLedger.`);
  }

  // 5. Create Inbound & Outbound Phone Numbers
  const phoneNumbers = [
    {
      phoneNumber: "+919876543210",
      countryCode: "IN",
      provider: "plivo",
      direction: "both",
      friendlyName: "Bangalore Main Line",
    },
    {
      phoneNumber: "+15551234567",
      countryCode: "US",
      provider: "plivo",
      direction: "outbound",
      friendlyName: "US Toll Free Outbound",
    },
  ];

  for (const p of phoneNumbers) {
    const existing = await PhoneNumberModel.findOne({
      phoneNumber: p.phoneNumber,
    });
    if (!existing) {
      await new PhoneNumberModel({
        organizationId: org._id,
        phoneNumber: p.phoneNumber,
        countryCode: p.countryCode,
        provider: p.provider,
        direction: p.direction,
        status: "active",
      }).save();
      console.log(`Allocated phone number: ${p.phoneNumber}`);
    }
  }

  // 6. Create Canonical Agents
  let agent1 = await AgentModel.findOne({
    organizationId: org._id,
    name: "Priya - Real Estate Sales Qualifier",
  });

  if (!agent1) {
    agent1 = new AgentModel({
      organizationId: org._id,
      name: "Priya - Real Estate Sales Qualifier",
      status: "active",
      config: {
        identity: {
          name: "Priya",
          description: "Hindi-English bilingual luxury property sales consultant",
          language: "hi",
        },
        instructions: {
          systemPrompt:
            "You are Priya, a polite and professional real estate consultant for Acme Real Estate in India. Your goal is to qualify prospective buyers for our new luxury apartment project in Bangalore.",
          greeting:
            "Namaste! Main Priya baat kar rahi hoon Acme Real Estate se. Kya aap naye residential villa projects dekh rahe hain?",
        },
        voice: {
          provider: "cartesia",
          voiceId: "126a0835-beea-4e77-a883-f66eabcf6dd4",
          model: "sonic-3",
          speed: 1.0,
        },
        intelligence: {
          provider: "openrouter",
          model: "google/gemini-2.5-flash",
          temperature: 0.7,
        },
        speech: {
          sttProvider: "cartesia",
          sttModel: "ink-whisper",
          ttsProvider: "cartesia",
          ttsModel: "sonic-3",
        },
        telephony: {
          provider: "plivo",
        },
        tools: {
          enabledTools: ["book_appointment", "transfer_call", "check_availability"],
        },
        settings: {
          interruptionHandling: true,
          silenceTimeout: 20,
          maxCallDuration: 900,
          recordingEnabled: true,
        },
      },
    });
    await agent1.save();

    const version1 = new AgentVersionModel({
      agentId: agent1._id,
      organizationId: org._id,
      versionNumber: 1,
      name: "v1.0 - Initial Production Release",
      config: agent1.config,
      isPublished: true,
      publishedAt: new Date(),
    });
    await version1.save();
    agent1.currentVersionId = version1._id;
    agent1.publishedVersionNumber = 1;
    await agent1.save();
    console.log(`Created agent: ${agent1.name} (v1 published)`);
  }

  // 7. Seed Contacts & DNC
  const sampleContacts = [
    { name: "Rahul Sharma", phone: "+919811122233" },
    { name: "Ananya Iyer", phone: "+919822233344" },
    { name: "Vikram Malhotra", phone: "+919833344455" },
    { name: "Deepa Reddy", phone: "+919844455566" },
  ];

  const contactDocs = [];
  for (const sc of sampleContacts) {
    let c = await ContactModel.findOne({
      organizationId: org._id,
      normalizedPhone: sc.phone,
    });
    if (!c) {
      c = new ContactModel({
        organizationId: org._id,
        name: sc.name,
        phone: sc.phone,
        normalizedPhone: sc.phone,
        doNotCall: false,
      });
      await c.save();
      console.log(`Added contact: ${sc.name} (${sc.phone})`);
    }
    contactDocs.push(c);
  }

  // Seed DNC Entry
  const dncPhone = "+919899999999";
  const existingDnc = await DncEntryModel.findOne({
    organizationId: org._id,
    normalizedPhone: dncPhone,
  });
  if (!existingDnc) {
    await new DncEntryModel({
      organizationId: org._id,
      normalizedPhone: dncPhone,
      reason: "Requested opt-out via compliance SMS",
    }).save();
    console.log(`Added DNC entry: ${dncPhone}`);
  }

  // 8. Seed Outbound Campaign
  let campaign = await CampaignModel.findOne({
    organizationId: org._id,
    name: "Q3 Bangalore Luxury Villa Outreach",
  });
  if (!campaign) {
    campaign = new CampaignModel({
      organizationId: org._id,
      agentId: agent1._id,
      name: "Q3 Bangalore Luxury Villa Outreach",
      status: "running",
      totalContacts: contactDocs.length,
      callsCompleted: 1,
      concurrencyLimit: 5,
    });
    await campaign.save();

    for (const c of contactDocs) {
      await new CampaignContactModel({
        campaignId: campaign._id,
        contactId: c._id,
        organizationId: org._id,
        callStatus: "pending",
        attemptCount: 0,
      }).save();
    }
    console.log(`Created campaign: ${campaign.name} with ${contactDocs.length} contacts.`);
  }

  // 9. Seed Sample Call with Multi-Turn Transcript and Outcome
  const sampleCall = await CallModel.findOne({
    organizationId: org._id,
    toNumber: contactDocs[0].normalizedPhone,
  });

  if (!sampleCall) {
    const call = new CallModel({
      organizationId: org._id,
      agentId: agent1._id,
      campaignId: campaign._id,
      contactId: contactDocs[0]._id,
      provider: "plivo",
      providerCallId: `call_${new mongoose.Types.ObjectId()}`,
      direction: "outbound",
      status: "COMPLETED",
      fromNumber: "+919876543210",
      toNumber: contactDocs[0].normalizedPhone,
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
      answeredAt: new Date(Date.now() - 9 * 60 * 1000),
      endedAt: new Date(Date.now() - 7 * 60 * 1000),
      durationSeconds: 120,
      costCredits: 0.5,
      summary:
        "Prospect Rahul Sharma was interested in 3BHK luxury villas in Whitefield. Requested site visit consultation tomorrow at 3 PM.",
      outcome: "interested",
    });
    await call.save();

    const transcript = new TranscriptModel({
      callId: call._id,
      organizationId: org._id,
      segments: [
        {
          speaker: "agent",
          text: "Namaste Rahul ji! Main Priya baat kar rahi hoon Acme Real Estate se. Kya aap Whitefield mein villa projects dekh rahe hain?",
          startMs: 0,
          endMs: 4800,
        },
        {
          speaker: "user",
          text: "Haan ji, main kuch 3BHK villas explore kar raha hoon. Kya pricing hai?",
          startMs: 5200,
          endMs: 9200,
        },
        {
          speaker: "agent",
          text: "Hamare 3BHK villas 2.5 Crore se shuru hote hain with private garden. Kya hum kal site visit schedule karein?",
          startMs: 9800,
          endMs: 15800,
        },
        {
          speaker: "user",
          text: "Ji bilkul, kal dopehar 3 baje ka slot theek rahega.",
          startMs: 16400,
          endMs: 20200,
        },
        {
          speaker: "agent",
          text: "Perfect, maine kal 3 baje ka appointment confirm kar diya hai. Thank you so much!",
          startMs: 21000,
          endMs: 25000,
        },
      ],
    });
    await transcript.save();

    const outcome = new CallOutcomeModel({
      callId: call._id,
      organizationId: org._id,
      disposition: "interested",
      leadStatus: "qualified",
      interestLevel: "high",
      requestedCallback: false,
      budget: "2.5 Cr",
      location: "Whitefield, Bangalore",
    });
    await outcome.save();

    call.transcriptId = transcript._id;
    await call.save();

    // Appointment
    await new AppointmentModel({
      organizationId: org._id,
      agentId: agent1._id,
      contactId: contactDocs[0]._id,
      callId: call._id,
      title: "Rahul Sharma - Whitefield Villa Consultation",
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      timezone: "Asia/Kolkata",
      status: "confirmed",
      notes: "Lead interested in 3BHK unit facing the park.",
    }).save();

    // Audit log
    await new AuditLogModel({
      organizationId: org._id,
      userId: user._id,
      action: "seed.initialize",
      resource: "system",
      details: { seeded: true, timestamp: new Date() },
      createdAt: new Date(),
    }).save();

    console.log(`Created sample call with multi-turn transcript and booked appointment.`);
  }

  console.log("==================================================");
  console.log("  DATABASE SEEDING COMPLETE!");
  console.log("  Login: demo@sigulon.ai");
  console.log("  Password: Password123!");
  console.log("==================================================");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed with error:", err);
  process.exit(1);
});
