import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { UserRepository } from "@sigulon/database";
import { hashPassword } from "@/lib/auth";
import { EmailDeliveryError, sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Request password reset or confirm new password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = "request", email, token, newPassword } = body;

    if (action === "request") {
      if (!email) {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
      }
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const exists = await UserRepository.setPasswordResetToken(email, resetToken, expiresAt);
      let delivery: "sent" | "development" | undefined;
      if (exists) {
        try {
          delivery = await sendPasswordResetEmail({ to: email.trim().toLowerCase(), token: resetToken });
        } catch (err) {
          await UserRepository.clearPasswordResetToken(email);
          throw err;
        }
      }
      return NextResponse.json({
        success: true,
        message: "If an account exists, a password reset link has been dispatched.",
        ...(process.env.NODE_ENV !== "production" && exists
          ? { resetToken, delivery: delivery ?? "development" }
          : {}),
      });
    }

    if (action === "confirm") {
      if (!token || !newPassword || newPassword.length < 8) {
        return NextResponse.json(
          { error: "Token and a new password of at least 8 characters are required." },
          { status: 400 }
        );
      }
      const newHash = await hashPassword(newPassword);
      const user = await UserRepository.resetPassword(token, newHash);
      if (!user) {
        return NextResponse.json(
          { error: "Invalid or expired password reset token." },
          { status: 400 }
        );
      }
      await UserRepository.revokeAllUserSessions(user._id);
      return NextResponse.json({
        success: true,
        message: "Password reset successful. Please log in with your new password.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const status = err instanceof EmailDeliveryError ? 503 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Password reset failed" },
      { status }
    );
  }
}
