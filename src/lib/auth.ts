import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { UserRepository } from "@sigulon/database";
import { IUser } from "@sigulon/database";

export const SESSION_COOKIE_NAME = "sigulon_session";
export const ACTIVE_ORG_COOKIE_NAME = "sigulon_active_org_id";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Hash password with bcrypt using 12 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Compare plain password with stored hash.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Generate a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Issue a new session in MongoDB and set the HTTP-only cookie.
 */
export async function createAndSetSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await UserRepository.createSession({
    userId,
    token,
    expiresAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return token;
}

/**
 * Validate the current session from HTTP-only cookie.
 */
export async function getAuthenticatedUser(): Promise<IUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await UserRepository.findSession(token);
    if (!session || !session.userId) {
      return null;
    }

    return session.userId as unknown as IUser;
  } catch (err) {
    console.error("[auth] Error validating session:", err);
    return null;
  }
}

/**
 * Revoke the current session and clear cookie.
 */
export async function destroySession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await UserRepository.revokeSession(token);
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (err) {
    console.error("[auth] Error destroying session:", err);
  }
}
