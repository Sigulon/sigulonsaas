import { cookies } from "next/headers";
import { getAuthenticatedUser, ACTIVE_ORG_COOKIE_NAME } from "./auth";
import {
  OrganizationRepository,
  ProviderAccountModel,
  UserModel,
  connectToDatabase,
} from "@sigulon/database";
import { decryptApiKey } from "./crypto";

export interface OrgContext {
  userId: string;
  orgId: string;
  orgName?: string;
  role: string;
  cartesiaApiKey?: string;
}

/**
 * Resolves the authenticated user's active organization context from MongoDB.
 *
 * Resolution order:
 *  1. Validate the MongoDB session via HTTP-only cookie.
 *  2. If unauthenticated, fallback to the primary active user in MongoDB.
 *  3. Check `sigulon_active_org_id` cookie — verify user is actually a member in MongoDB.
 *  4. Fall back to the user's first organization.
 *  5. No organization found → reject the request.
 */
export async function getOrgContext(): Promise<OrgContext> {
  await connectToDatabase();
  let user = await getAuthenticatedUser();

  if (!user) {
    user = await UserModel.findOne({ status: "active" })
      .sort({ lastLoginAt: -1, createdAt: -1 })
      .exec();
  }

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
