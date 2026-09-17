import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, ACTIVE_ORG_COOKIE_NAME } from "@/lib/auth";
import { OrganizationRepository } from "@sigulon/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId } = body;

    if (!orgId || typeof orgId !== "string") {
      return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized — valid session required." },
        { status: 401 }
      );
    }

    const member = await OrganizationRepository.getMember(orgId, user._id);
    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this organization." },
        { status: 403 }
      );
    }

    const org = await OrganizationRepository.findById(orgId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      success: true,
      activeOrgId: org._id.toString(),
      name: org.name,
    });

    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, org._id.toString(), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
