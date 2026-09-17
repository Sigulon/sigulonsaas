/**
 * Tenant-isolation contract tests (A ↛ B).
 *
 * Row-level scoping lives in API routes (every query filters `org_id`, and
 * `getOrgContext` binds the org to the session). These tests pin the pure
 * decision surface that isolation depends on:
 *
 *   1. DNC entries suppress only their own org — the same line stays
 *      diallable for every other tenant.
 *   2. Number matching never confuses two different subscriber lines
 *      (no cross-tenant misdial via suffix collision).
 *   3. Role gates never escalate across the viewer/member/admin/owner line.
 */

import { describe, expect, it } from "vitest";
import { buildDncIndex, isDncListed } from "../dnc";
import { normalizePhone, sameLine } from "../phone";
import { canManageTeam, roleChangeError } from "../roles";

const ORG_A = "org-a";
const ORG_B = "org-b";
const LINE = "+919876543210";

describe("DNC is org-scoped", () => {
  const index = buildDncIndex([{ org_id: ORG_A, normalized_phone: LINE }]);
  const contact = {
    id: "ct1",
    phone_number: LINE,
    normalized_phone: LINE,
    do_not_call: false,
  };

  it("suppresses the listing org only", () => {
    expect(isDncListed(ORG_A, contact, index)).toBe(true);
    expect(isDncListed(ORG_B, contact, index)).toBe(false);
  });

  it("a per-contact flag suppresses everywhere (explicit opt-out)", () => {
    const flagged = { ...contact, do_not_call: true };
    expect(isDncListed(ORG_A, flagged, index)).toBe(true);
    expect(isDncListed(ORG_B, flagged, index)).toBe(true);
  });
});

describe("number matching cannot cross lines", () => {
  it("different subscriber digits never match", () => {
    expect(sameLine("+919876543210", "+911234567890")).toBe(false);
    // Trunk prefixes vary per sender, so row matching is suffix-based —
    // but the canonical form stays single-valued per line.
    expect(sameLine("09876543210", "+919876543210")).toBe(true);
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });

  it("short codes never match full numbers", () => {
    expect(sameLine("43210", LINE)).toBe(false);
  });
});

describe("roles never escalate sideways", () => {
  it("members/viewers cannot touch team management", () => {
    expect(canManageTeam("member")).toBe(false);
    expect(canManageTeam("viewer")).toBe(false);
    expect(
      roleChangeError({
        actorRole: "member",
        actorUserId: "u1",
        targetUserId: "u2",
        targetRole: "member",
        newRole: "member",
        ownerCount: 1,
      })
    ).not.toBeNull();
  });

  it("admins cannot reach owner/admin rows", () => {
    for (const targetRole of ["owner", "admin"]) {
      expect(
        roleChangeError({
          actorRole: "admin",
          actorUserId: "u1",
          targetUserId: "u2",
          targetRole,
          newRole: "member",
          ownerCount: 2,
        })
      ).not.toBeNull();
    }
  });
});
