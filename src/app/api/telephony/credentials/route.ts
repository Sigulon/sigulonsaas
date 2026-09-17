import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/auth-helpers";
import { ProviderAccountRepository } from "@sigulon/database";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";
import { verifyPlivoCredentials } from "@/lib/plivo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;
    const account = await ProviderAccountRepository.findByOrgAndProvider(orgId, "plivo");

    if (account && account.status === "active") {
      try {
        const decryptedRaw = decryptApiKey(account.credentialsEncrypted, account.encryptionIv);
        const parsed = JSON.parse(decryptedRaw);
        const authId = parsed.authId || "";
        const masked = authId.length > 8
          ? `${authId.slice(0, 4)}...${authId.slice(-4)}`
          : "••••••••";

        return NextResponse.json({
          configured: true,
          provider: "plivo",
          authIdMasked: masked,
          source: "byoc",
          status: account.status,
        });
      } catch {
        return NextResponse.json({
          configured: true,
          provider: "plivo",
          authIdMasked: "••••••••",
          source: "byoc",
          status: "active",
        });
      }
    }

    // Check environment fallback
    const envAuthId = process.env.PLIVO_AUTH_ID;
    if (envAuthId) {
      const masked = envAuthId.length > 8
        ? `${envAuthId.slice(0, 4)}...${envAuthId.slice(-4)}`
        : "••••••••";
      return NextResponse.json({
        configured: true,
        provider: "plivo",
        authIdMasked: masked,
        source: "env",
        status: "active",
      });
    }

    return NextResponse.json({
      configured: false,
      provider: "plivo",
      authIdMasked: "",
      source: "none",
      status: "unconfigured",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;
    const body = await req.json();

    const { authId, authToken, validateOnly } = body;
    if (!authId || !authToken) {
      return NextResponse.json(
        { error: "Both Plivo Auth ID and Auth Token are required." },
        { status: 400 }
      );
    }

    // Live verification with Plivo
    const verification = await verifyPlivoCredentials({
      authId: authId.trim(),
      authToken: authToken.trim(),
    });

    if (!verification.valid) {
      return NextResponse.json(
        { error: `Plivo verification failed: ${verification.error}` },
        { status: 400 }
      );
    }

    if (validateOnly) {
      return NextResponse.json({
        success: true,
        message: "Plivo connection verified successfully!",
        accountType: verification.accountType,
      });
    }

    const payload = JSON.stringify({
      authId: authId.trim(),
      authToken: authToken.trim(),
    });

    const { encrypted, iv } = encryptApiKey(payload);

    await ProviderAccountRepository.upsert(
      orgId,
      "plivo",
      encrypted,
      iv,
      "active"
    );

    const masked = authId.trim().length > 8
      ? `${authId.trim().slice(0, 4)}...${authId.trim().slice(-4)}`
      : "••••••••";

    return NextResponse.json({
      success: true,
      authIdMasked: masked,
      message: `Plivo credentials verified and saved successfully (${verification.accountType} account).`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function DELETE() {
  try {
    const context = await getOrgContext();
    requireRole(context, ["admin", "owner"]);
    const { orgId } = context;
    await ProviderAccountRepository.delete(orgId, "plivo");
    return NextResponse.json({ success: true, message: "Custom Plivo credentials cleared." });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
