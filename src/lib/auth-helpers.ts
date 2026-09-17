import { cookies } from "next/headers";
import { getAuthenticatedUser, ACTIVE_ORG_COOKIE_NAME } from "./auth";
import {
  OrganizationRepository,
  ProviderAccountModel,
} from "@sigulon/database";
import { decryptApiKey } from "./crypto";

export interface OrgContext {
  userId: string;
  orgId: string;
  orgName?: string;
  role: string;
  cartesiaApiKey?: string;
}

/** Demo data bypasses are disabled to ensure real MongoDB data is always used. */
export function isDemoModeEnabled(): boolean {
  return false;
}

/**
 * Resolves the authenticated user's active organization context from MongoDB.
 *
 * Resolution order:
 *  1. Validate the MongoDB session via HTTP-only cookie.
 *  2. Check `sigulon_active_org_id` cookie — verify user is actually a member in MongoDB.
 *  3. Fall back to the user's first organization.
 *  4. No session cookie → reject the request.
 */
export async function getOrgContext(): Promise<OrgContext> {
  const user = await getAuthenticatedUser();

  if (!user) {
    const err = new Error("Unauthorized");
    (err as NodeJS.ErrnoException).code = "UNAUTHORIZED";
    throw err;
  }

  const userId = user._id.toString();
  const cookieStore = await cookies();
  const activeOrgCookie = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;

  let orgId: string | undefined;
  let role = "member";
  let orgName: string | undefined;

  if (activeOrgCookie) {
    const member = await OrganizationRepository.getMember(activeOrgCookie, userId);
    if (member) {
      orgId = member.organizationId.toString();
      role = member.role;
      const org = await OrganizationRepository.findById(orgId);
      orgName = org?.name;
    }
  }

  if (!orgId) {
    const memberships = await OrganizationRepository.findUserMemberships(userId);
    if (memberships.length > 0) {
      const first = memberships[0];
      orgId = first.organization._id.toString();
      role = first.role;
      orgName = first.organization.name;
    }
  }

  if (!orgId) {
    const err = new Error("No organization found for this account.");
    (err as NodeJS.ErrnoException).code = "UNAUTHORIZED";
    throw err;
  }

  // Resolve Cartesia API key: BYOK credential encrypted in MongoDB -> platform env key
  let cartesiaApiKey = process.env.CARTESIA_API_KEY;
  try {
    const cred = await ProviderAccountModel.findOne({
      organizationId: orgId,
      provider: "cartesia",
      status: "active",
    }).exec();

    if (cred?.credentialsEncrypted && cred?.encryptionIv) {
      cartesiaApiKey = decryptApiKey(
        cred.credentialsEncrypted,
        cred.encryptionIv
      );
    }
  } catch {
    // If decryption fails, fall back to platform key
  }

  return {
    userId,
    orgId,
    orgName,
    role,
    cartesiaApiKey,
  };
}

export function requireRole(context: OrgContext, allowedRoles: string[]): void {
  if (!allowedRoles.includes(context.role)) {
    const err = new Error(`Forbidden: requires one of [${allowedRoles.join(", ")}]`);
    (err as NodeJS.ErrnoException).code = "FORBIDDEN";
    throw err;
  }
}
