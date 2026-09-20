import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  UserRepository,
  OrganizationRepository,
  AgentRepository,
  BillingRepository,
} from "@sigulon/database";
import { hashPassword, createAndSetSession, ACTIVE_ORG_COOKIE_NAME } from "@/lib/auth";
import {
  CARTESIA_STT_PROVIDER,
  CARTESIA_TTS_MODEL,
  CARTESIA_TTS_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name = "", companyName = "" } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    // Do NOT self-verify: the address is unverified until the holder
    // completes the /api/auth/verify-email token flow. A verification token
    // is minted here so that flow can complete.
    // TODO: gate the 50-credit welcome grant (and/or outbound dialing) behind
    // emailVerified=true once a signup verification email sender exists.
    // Today no verification email is sent, so the trial grant below activates
    // on an unverified email — accepted trial-on-unverified risk, documented.
    const { randomBytes } = crypto;
    const user = await UserRepository.create({
      email,
      passwordHash,
      name: name || companyName || email.split("@")[0],
      status: "active",
      emailVerified: false,
      verificationToken: randomBytes(32).toString("hex"),
    });

    const orgName = companyName || `${user.name || "My"} Organization`;
    const { organization } = await OrganizationRepository.createOrganizationWithMember({
      name: orgName,
      userId: user._id,
    });

    // Ensure billing account exists with initial trial credits (e.g. 50 credits)
    await BillingRepository.ensureAccount(organization._id);
    await BillingRepository.grantCredits({
      organizationId: organization._id,
      amount: 50,
      type: "credit_grant",
      idempotencyKey: `welcome:${organization._id}`,
      metadata: { reason: "Welcome trial grant" },
    });

    // Create starter voice agent
    await AgentRepository.create({
      organizationId: organization._id,
      name: "General Receptionist",
      status: "active",
      config: {
        identity: {
          name: "Sarah",
          description: "Friendly front-desk receptionist",
          language: "hi",
        },
        instructions: {
          systemPrompt: `You are Sarah, a professional AI voice assistant for ${organization.name}. Greet callers warmly, answer their questions, and offer to schedule an appointment or take a callback.`,
          greeting: `Hello! Thank you for calling ${organization.name}. How can I assist you today?`,
        },
        voice: {
          provider: CARTESIA_TTS_PROVIDER,
          voiceId: "126a0835-beea-4e77-a883-f66eabcf6dd4",
          model: CARTESIA_TTS_MODEL,
          speed: 1.0,
        },
        intelligence: {
          provider: "openrouter",
          model: OPENROUTER_DEFAULT_MODEL,
          temperature: 0.7,
        },
        speech: {
          sttProvider: CARTESIA_STT_PROVIDER,
          sttModel: "ink-whisper",
          ttsProvider: CARTESIA_TTS_PROVIDER,
          ttsModel: CARTESIA_TTS_MODEL,
        },
        telephony: {
          provider: "plivo",
        },
        tools: {
          enabledTools: ["check_availability", "pricing_lookup"],
        },
        settings: {
          interruptionHandling: true,
          silenceTimeout: 10,
          maxCallDuration: 600,
          recordingEnabled: true,
        },
        business: {
          timezone: "Asia/Kolkata",
        },
      },
    });

    const userAgent = req.headers.get("user-agent") || "";
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "";

    await createAndSetSession(user._id.toString(), {
      userAgent,
      ipAddress,
    });

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
        },
        organization: {
          id: organization._id.toString(),
          name: organization.name,
        },
      },
      { status: 201 }
    );

    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, organization._id.toString(), {
      httpOnly: false, // Accessible by UI client for active workspace indicator
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (err: unknown) {
    console.error("[api/auth/signup] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign up" },
      { status: 500 }
    );
  }
}
