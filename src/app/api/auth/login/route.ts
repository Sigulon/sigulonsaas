import { NextRequest, NextResponse } from "next/server";
import {
  UserRepository,
  OrganizationRepository,
} from "@sigulon/database";
import {
  verifyPassword,
  createAndSetSession,
  ACTIVE_ORG_COOKIE_NAME,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    await UserRepository.updateLastLogin(user._id);

    const userAgent = req.headers.get("user-agent") || "";
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "";

    await createAndSetSession(user._id.toString(), {
      userAgent,
      ipAddress,
    });

    const memberships = await OrganizationRepository.findUserMemberships(user._id);
    const activeOrg = memberships.length > 0 ? memberships[0].organization : null;

    const response = NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
      organization: activeOrg
        ? {
            id: activeOrg._id.toString(),
            name: activeOrg.name,
          }
        : null,
    });

    if (activeOrg) {
      response.cookies.set(ACTIVE_ORG_COOKIE_NAME, activeOrg._id.toString(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (err: unknown) {
    console.error("[api/auth/login] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to log in" },
      { status: 500 }
    );
  }
}
