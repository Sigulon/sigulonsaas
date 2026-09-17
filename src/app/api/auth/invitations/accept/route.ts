import { NextRequest, NextResponse } from "next/server";
import {
  OrganizationMemberModel,
  TeamInviteModel,
  UserModel,
  UserRepository,
  withTransaction,
} from "@sigulon/database";
import {
  ACTIVE_ORG_COOKIE_NAME,
  createAndSetSession,
  getAuthenticatedUser,
  hashPassword,
} from "@/lib/auth";
import { hashOpaqueToken } from "@/lib/email";

export const dynamic = "force-dynamic";

class InviteAcceptanceError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
    }

    const tokenHash = hashOpaqueToken(token);
    const invite = await TeamInviteModel.findOne({
      token: tokenHash,
      status: "pending",
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!invite) {
      return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 400 });
    }

    const email = invite.email.toLowerCase();
    const currentUser = await getAuthenticatedUser();
    const existingUser = await UserRepository.findByEmail(email);
    const needsActivation = !existingUser || existingUser.status === "pending";

    if (!needsActivation && currentUser?.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: `Sign in as ${email} before accepting this invitation.` },
        { status: 401 }
      );
    }
    if (existingUser?.status === "suspended") {
      return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
    }
    if (needsActivation && password.length < 8) {
      return NextResponse.json(
        { error: "Set a password of at least 8 characters to accept this invitation." },
        { status: 400 }
      );
    }

    const passwordHash = needsActivation ? await hashPassword(password) : "";
    const accepted = await withTransaction(async (session) => {
      // Re-claim the invite in the transaction; a token can grant access once.
      const claimed = await TeamInviteModel.findOneAndUpdate(
        {
          _id: invite._id,
          token: tokenHash,
          status: "pending",
          expiresAt: { $gt: new Date() },
        },
        { $set: { status: "accepted" } },
        { returnDocument: "after", session }
      ).exec();
      if (!claimed) throw new InviteAcceptanceError("This invitation was already used or expired.");

      let user = existingUser;
      if (!user) {
        user = await new UserModel({
          email,
          passwordHash,
          name: name || email.split("@")[0],
          status: "active",
          emailVerified: true,
        }).save({ session });
      } else if (user.status === "pending") {
        user = await UserModel.findByIdAndUpdate(
          user._id,
          {
            $set: {
              passwordHash,
              name: name || user.name || email.split("@")[0],
              status: "active",
              emailVerified: true,
            },
          },
          { returnDocument: "after", session }
        ).exec();
      }
      if (!user) throw new InviteAcceptanceError("Unable to activate the invited account.");

      await OrganizationMemberModel.findOneAndUpdate(
        { organizationId: claimed.organizationId, userId: user._id },
        { $set: { role: claimed.role } },
        { upsert: true, returnDocument: "after", session }
      ).exec();
      return { user, organizationId: claimed.organizationId.toString(), createdSession: needsActivation };
    });

    if (accepted.createdSession) {
      await createAndSetSession(accepted.user._id.toString(), {
        userAgent: req.headers.get("user-agent") || "",
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "",
      });
    }

    const response = NextResponse.json({
      success: true,
      organization_id: accepted.organizationId,
      message: "Invitation accepted. Welcome to the workspace.",
    });
    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, accepted.organizationId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (err: unknown) {
    const status = err instanceof InviteAcceptanceError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to accept invitation." },
      { status }
    );
  }
}
