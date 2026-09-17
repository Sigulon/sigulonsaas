import { ProviderAccountRepository } from "@sigulon/database";
import { decryptApiKey } from "./crypto";

export interface PlivoCredentials {
  authId: string;
  authToken: string;
  source: "workspace" | "platform";
}

type StoredPlivoCredentials = { authId?: unknown; authToken?: unknown };

function parseStoredCredentials(encrypted: string, iv: string): Omit<PlivoCredentials, "source"> {
  const parsed = JSON.parse(decryptApiKey(encrypted, iv)) as StoredPlivoCredentials;
  const authId = typeof parsed.authId === "string" ? parsed.authId.trim() : "";
  const authToken = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
  if (!authId || !authToken) {
    throw new Error("Stored Plivo credentials are incomplete.");
  }
  return { authId, authToken };
}

/** Platform credentials are a fallback for workspaces without BYOC. */
export function getPlatformPlivoCredentials(): PlivoCredentials | null {
  const authId = process.env.PLIVO_AUTH_ID?.trim() || "";
  const authToken = process.env.PLIVO_AUTH_TOKEN?.trim() || "";
  return authId && authToken ? { authId, authToken, source: "platform" } : null;
}

/**
 * Resolve the credential pair used to create calls for a workspace. The
 * workspace record, when active, intentionally takes precedence over the
 * platform fallback so separate Plivo accounts cannot be mixed.
 */
export async function getPlivoCredentialsForOrg(
  orgId: string
): Promise<PlivoCredentials | null> {
  const account = await ProviderAccountRepository.findByOrgAndProvider(orgId, "plivo");
  if (account?.status === "active") {
    return {
      ...parseStoredCredentials(account.credentialsEncrypted, account.encryptionIv),
      source: "workspace",
    };
  }
  return getPlatformPlivoCredentials();
}

/**
 * Webhooks only need the signing token. This keeps platform validation
 * available while allowing workspace webhooks to be selected by their known
 * number or call before their signature is trusted.
 */
export async function getPlivoWebhookTokenForOrg(
  orgId: string | null | undefined
): Promise<string | null> {
  if (orgId) {
    const credentials = await getPlivoCredentialsForOrg(orgId);
    if (credentials) return credentials.authToken;
  }
  return process.env.PLIVO_AUTH_TOKEN?.trim() || null;
}
