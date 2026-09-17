/**
 * Org role model — the single place role checks live (API routes import
 * these; the team page mirrors them for button visibility only).
 *
 * Hierarchy: viewer (read) < member (create & run) < admin (manage team,
 * billing, numbers) < owner (everything, incl. role grants).
 */

import type { UserRole } from "./types";

const RANK: Record<UserRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function roleRank(role: string): number {
  return RANK[role as UserRole] ?? -1;
}

/** Team management (invite / change role / remove) needs admin+. */
export function canManageTeam(role: string): boolean {
  return roleRank(role) >= RANK.admin;
}

/** Destructive org settings (delete org, transfer ownership) need owner. */
export function isOwner(role: string): boolean {
  return role === "owner";
}

export interface RoleChangeInput {
  actorRole: string;
  actorUserId: string;
  targetUserId: string;
  targetRole: string;
  newRole: string;
  ownerCount: number;
}

/**
 * Pure role-change policy. Returns null when allowed, else a human reason.
 * Owner-counting (last-owner guard) stays here so routes and tests share it.
 */
export function roleChangeError(input: RoleChangeInput): string | null {
  const { actorRole, actorUserId, targetUserId, targetRole, newRole, ownerCount } = input;

  if (!canManageTeam(actorRole)) {
    return "Requires admin or owner role.";
  }
  if (!RANK.hasOwnProperty(newRole)) {
    return `Unknown role: ${newRole}.`;
  }
  if (actorRole !== "owner") {
    // Admins manage members/viewers only — never owners, never admins.
    if (targetRole === "owner" || targetRole === "admin") {
      return "Only owners can change owner/admin roles.";
    }
    if (newRole === "owner" || newRole === "admin") {
      return "Only owners can grant owner/admin roles.";
    }
  }
  if (targetRole === "owner" && newRole !== "owner") {
    if (ownerCount <= 1) {
      return "Cannot demote the last owner.";
    }
    if (actorUserId === targetUserId && ownerCount <= 1) {
      return "Cannot demote the last owner.";
    }
  }
  return null;
}

export interface RemoveInput {
  actorRole: string;
  targetRole: string;
  isSelf: boolean;
  ownerCount: number;
}

/** Pure removal policy. Returns null when allowed, else a human reason. */
export function removeError(input: RemoveInput): string | null {
  const { actorRole, targetRole, ownerCount } = input;
  if (!canManageTeam(actorRole)) {
    return "Requires admin or owner role.";
  }
  if (actorRole !== "owner" && (targetRole === "owner" || targetRole === "admin")) {
    return "Only owners can remove owners/admins.";
  }
  if (targetRole === "owner" && ownerCount <= 1) {
    return "Cannot remove the last owner.";
  }
  return null;
}
