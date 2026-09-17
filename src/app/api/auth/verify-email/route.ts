import { NextRequest, NextResponse } from "next/server";
import { UserRepository } from "@sigulon/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Verification token is required" }, { status: 400 });
    }

    const verified = await UserRepository.verifyEmail(token);
    if (!verified) {
      return NextResponse.json({ error: "Invalid or expired verification token" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Email verified successfully" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
