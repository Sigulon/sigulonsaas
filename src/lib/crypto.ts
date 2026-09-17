import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// Secrets are customer credentials; an unset key must never silently select a
// publicly-known fallback that could decrypt another deployment's data.
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_SECRET must be configured with at least 32 characters.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plain text string using AES-256-GCM
 */
export function encryptApiKey(plainText: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  // Pack ciphertext and authTag together
  const payload = `${encrypted}:${authTag}`;

  return {
    encrypted: payload,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload
 */
export function decryptApiKey(encryptedPayload: string, ivHex: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted payload format");
  }

  const [cipherText, authTagHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
