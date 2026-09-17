import { describe, expect, it } from "vitest";
import {
  canManageTeam,
  isOwner,
  removeError,
  roleChangeError,
  roleRank,
} from "../roles";

describe("roleRank / gates", () => {
  it("orders viewer < member < admin < owner", () => {
    expect(roleRank("viewer")).toBeLessThan(roleRank("member"));
    expect(roleRank("member")).toBeLessThan(roleRank("admin"));
    expect(roleRank("admin")).toBeLessThan(roleRank("owner"));
    expect(roleRank("nobody")).toBe(-1);
  });

  it("gates team management to admin+", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("member")).toBe(false);
    expect(canManageTeam("viewer")).toBe(false);
    expect(isOwner("admin")).toBe(false);
    expect(isOwner("owner")).toBe(true);
  });
});

describe("roleChangeError", () => {
  const base = {
    actorRole: "owner",
    actorUserId: "u1",
    targetUserId: "u2",
    targetRole: "member",
    newRole: "admin",
    ownerCount: 2,
  };

  it("allows owner grants", () => {
    expect(roleChangeError(base)).toBeNull();
  });

  it("blocks non-managers outright", () => {
    expect(
      roleChangeError({ ...base, actorRole: "member" })
    ).toMatch(/admin or owner/);
  });

  it("confines admins to member/viewer moves", () => {
    expect(
      roleChangeError({ ...base, actorRole: "admin", newRole: "owner" })
    ).toMatch(/Only owners/);
    expect(
      roleChangeError({ ...base, actorRole: "admin", targetRole: "admin" })
    ).toMatch(/Only owners/);
    expect(
      roleChangeError({
        ...base,
        actorRole: "admin",
        targetRole: "member",
        newRole: "member",
      })
    ).toBeNull();
  });

  it("protects the last owner", () => {
    expect(
      roleChangeError({
        ...base,
        targetRole: "owner",
        newRole: "member",
        ownerCount: 1,
      })
    ).toMatch(/last owner/);
  });

  it("rejects unknown roles", () => {
    expect(roleChangeError({ ...base, newRole: "superadmin" })).toMatch(
      /Unknown role/
    );
  });
});

describe("removeError", () => {
  it("blocks non-managers and last-owner removal", () => {
    expect(
      removeError({ actorRole: "member", targetRole: "member", isSelf: false, ownerCount: 2 })
    ).toMatch(/admin or owner/);
    expect(
      removeError({ actorRole: "owner", targetRole: "owner", isSelf: false, ownerCount: 1 })
    ).toMatch(/last owner/);
    expect(
      removeError({ actorRole: "admin", targetRole: "admin", isSelf: false, ownerCount: 2 })
    ).toMatch(/Only owners/);
  });

  it("allows ordinary removals", () => {
    expect(
      removeError({ actorRole: "owner", targetRole: "member", isSelf: false, ownerCount: 1 })
    ).toBeNull();
    expect(
      removeError({ actorRole: "admin", targetRole: "viewer", isSelf: false, ownerCount: 1 })
    ).toBeNull();
  });
});
