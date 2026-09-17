import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import {
  OrganizationRepository,
  OrgRole,
  TeamInviteModel,
} from "@sigulon/database";
import { canManageTeam, roleChangeError, roleRank, removeError } from "@/lib/roles";
import crypto from "crypto";
import { EmailDeliveryError, hashOpaqueToken, sendTeamInviteEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId, userId, role } = await getOrgContext();
    const members = await OrganizationRepository.listMembers(orgId);

    const formatted = members.map((m) => ({
      user_id: m.userId,
      email: m.email,
      role: m.role,
    }));

    return NextResponse.json({
      members: formatted,
      your_user_id: userId,
      your_role: role,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as NodeJS.ErrnoException).code === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId: actorUserId, role: actorRole } = await getOrgContext();
    if (!canManageTeam(actorRole)) {
      return NextResponse.json(
        { error: "Requires admin or owner role." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const email = (body?.email as string)?.trim().toLowerCase();
    const newRole = ((body?.role as string) ?? "member") as OrgRole;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required." },
        { status: 400 }
      );
    }
    if (roleRank(newRole) < 0 || newRole === "owner") {
      return NextResponse.json(
        { error: "Role must be viewer, member, or admin (owners are promoted, not invited)." },
        { status: 400 }
      );
    }

    const existingMember = await OrganizationRepository.listMembers(orgId).then((members) =>
      members.find((member) => member.email.toLowerCase() === email)
    );
    if (existingMember) {
      return NextResponse.json(
        { error: "This person is already a workspace member. Use the role control to update access." },
        { status: 409 }
      );
    }
    const policyError = roleChangeError({
      actorRole,
      actorUserId,
      targetUserId: actorUserId,
      targetRole: "viewer",
      newRole,
      ownerCount: 0,
    });
    if (policyError) {
      const status = policyError.startsWith("Unknown") ? 400 : 403;
      return NextResponse.json({ error: policyError }, { status });
    }

    const organization = await OrganizationRepository.findById(orgId);
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await TeamInviteModel.findOneAndUpdate(
      { organizationId: orgId, email, status: "pending" },
      {
        $set: {
          role: newRole,
          token: hashOpaqueToken(rawToken),
          invitedBy: actorUserId,
          expiresAt,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).exec();

    try {
      const delivery = await sendTeamInviteEmail({
        to: email,
        token: rawToken,
        organizationName: organization.name,
        role: newRole,
      });
      return NextResponse.json(
        {
          success: true,
          email,
          role: newRole,
          expires_at: invite.expiresAt.toISOString(),
          ...(process.env.NODE_ENV !== "production" ? { delivery } : {}),
        },
        { status: 201 }
      );
    } catch (err) {
      await TeamInviteModel.updateOne(
        { _id: invite._id, status: "pending" },
        { $set: { status: "revoked" } }
      ).exec();
      throw err;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const status = err instanceof EmailDeliveryError ? 503 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { orgId, userId: actorUserId, role: actorRole } = await getOrgContext();
    if (!canManageTeam(actorRole)) {
      return NextResponse.json(
        { error: "Requires admin or owner role." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const targetUserId = body?.user_id as string;
    const targetRole = body?.role as OrgRole;

    if (!targetUserId || !targetRole) {
      return NextResponse.json(
        { error: "user_id and role are required." },
        { status: 400 }
      );
    }

    const currentTarget = await OrganizationRepository.getMember(orgId, targetUserId);
    if (!currentTarget) {
      return NextResponse.json(
        { error: "Member not found." },
        { status: 404 }
      );
    }

    const policyError = roleChangeError({
      actorRole,
      actorUserId,
      targetUserId,
      targetRole: currentTarget.role,
      newRole: targetRole,
      ownerCount: currentTarget.role === "owner"
        ? await OrganizationRepository.countOwners(orgId)
        : 0,
    });
    if (policyError) {
      const status = policyError.startsWith("Unknown") || policyError.includes("last owner")
        ? 400
        : 403;
      return NextResponse.json({ error: policyError }, { status });
    }

    await OrganizationRepository.addMember({
      organizationId: orgId,
      userId: targetUserId,
      role: targetRole,
    });

    return NextResponse.json({ success: true, role: targetRole });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { orgId, role: actorRole } = await getOrgContext();
    if (!canManageTeam(actorRole)) {
      return NextResponse.json(
        { error: "Requires admin or owner role." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("user_id");

    if (!targetUserId) {
      return NextResponse.json(
        { error: "user_id parameter is required." },
        { status: 400 }
      );
    }

    const targetMember = await OrganizationRepository.getMember(orgId, targetUserId);
    if (!targetMember) {
      return NextResponse.json(
        { error: "Member not found." },
        { status: 404 }
      );
    }

    const policyError = removeError({
      actorRole,
      targetRole: targetMember.role,
      isSelf: false,
      ownerCount: targetMember.role === "owner"
        ? await OrganizationRepository.countOwners(orgId)
        : 0,
    });
    if (policyError) {
      const status = policyError.includes("last owner") ? 400 : 403;
      return NextResponse.json({ error: policyError }, { status });
    }

    await OrganizationRepository.removeMember(orgId, targetUserId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
