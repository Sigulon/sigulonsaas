import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { OrganizationRepository, OrganizationModel, connectToDatabase } from "@sigulon/database";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await connectToDatabase();
  const user = await getAuthenticatedUser();

  if (!user) {
    try {
      const primaryOrg = await OrganizationModel.findOne().exec();
      if (primaryOrg) {
        return NextResponse.json({
          user: null,
          organization: { id: primaryOrg._id.toString(), name: primaryOrg.name },
          memberships: [{ id: primaryOrg._id.toString(), name: primaryOrg.name, role: "owner" }],
        });
      }
    } catch (e) {
      console.warn("[session] Failed to query primary org:", e);
    }
    return NextResponse.json({ user: null, organization: null });
  }

  const memberships = await OrganizationRepository.findUserMemberships(user._id);
  const cookieStore = await cookies();
  const activeOrgCookie = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;

  let activeOrg = memberships.find(
    (m) => m.organization._id.toString() === activeOrgCookie
  )?.organization;

  if (!activeOrg && memberships.length > 0) {
    activeOrg = memberships[0].organization;
  }

  return NextResponse.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    organization: activeOrg
      ? {
          id: activeOrg._id.toString(),
          name: activeOrg.name,
        }
      : null,
    memberships: memberships.map((m) => ({
      id: m.organization._id.toString(),
      name: m.organization.name,
      role: m.role,
    })),
  });
}
