import crypto from "crypto";
import nodemailer from "nodemailer";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export class EmailDeliveryError extends Error {}

function appUrl(): string {
  const configured = (process.env.APP_URL || process.env.PUBLIC_WEB_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new EmailDeliveryError("APP_URL must be configured for transactional email links.");
}

function emailConfig() {
  const host = process.env.SMTP_HOST?.trim() || "";
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASSWORD || "";
  const from = process.env.EMAIL_FROM?.trim() || "";
  const port = Number(process.env.SMTP_PORT || "587");
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1) return null;
  return { host, user, pass, from, port };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Digest bearer tokens before putting them in MongoDB. */
export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordResetUrl(token: string): string {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function invitationUrl(token: string): string {
  return `${appUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
}

/**
 * Send a transactional message. Development intentionally has a local-only
 * fallback so test runs do not require a mail server; production never
 * pretends delivery succeeded without a configured SMTP transport.
 */
export async function sendEmail(message: EmailMessage): Promise<"sent" | "development"> {
  const config = emailConfig();
  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] development delivery to ${message.to}: ${message.subject}\n${message.text}`);
      return "development";
    }
    throw new EmailDeliveryError("SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM are required.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: process.env.SMTP_SECURE === "true" || config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transporter.sendMail({ from: config.from, ...message });
  return "sent";
}

export async function sendPasswordResetEmail(input: { to: string; token: string }): Promise<"sent" | "development"> {
  const url = passwordResetUrl(input.token);
  return sendEmail({
    to: input.to,
    subject: "Reset your Sigulon password",
    text: `Use this link to reset your password. It expires in one hour:\n${url}`,
    html: `<p>Use this link to reset your Sigulon password. It expires in one hour.</p><p><a href="${escapeHtml(url)}">Reset password</a></p>`,
  });
}

export async function sendTeamInviteEmail(input: {
  to: string;
  token: string;
  organizationName: string;
  role: string;
}): Promise<"sent" | "development"> {
  const url = invitationUrl(input.token);
  const organizationName = escapeHtml(input.organizationName);
  const role = escapeHtml(input.role);
  return sendEmail({
    to: input.to,
    subject: `You've been invited to ${input.organizationName} on Sigulon`,
    text: `You've been invited to join ${input.organizationName} as ${input.role}. Accept within seven days:\n${url}`,
    html: `<p>You've been invited to join <strong>${organizationName}</strong> as ${role}.</p><p><a href="${escapeHtml(url)}">Accept invitation</a></p><p>This link expires in seven days.</p>`,
  });
}
