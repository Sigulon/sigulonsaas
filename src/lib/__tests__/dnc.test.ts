import { describe, expect, it } from "vitest";
import {
  buildDncIndex,
  isDncListed,
  partitionContacts,
  type DncContact,
} from "../dnc";

const contact = (over: Partial<DncContact> = {}): DncContact => ({
  id: "ct1",
  phone_number: "+919876543210",
  normalized_phone: "+919876543210",
  do_not_call: false,
  ...over,
});

describe("buildDncIndex", () => {
  it("groups numbers by org, skipping blanks", () => {
    const index = buildDncIndex([
      { org_id: "a", normalized_phone: "+919876543211" },
      { org_id: "a", normalized_phone: "+919876543212" },
      { org_id: "b", normalized_phone: "+919876543211" },
      { org_id: "", normalized_phone: "+919876543213" },
    ]);
    expect(index.get("a")).toEqual(new Set(["+919876543211", "+919876543212"]));
    expect(index.get("b")).toEqual(new Set(["+919876543211"]));
    expect(index.has("")).toBe(false);
  });

  it("normalizes entries on index build, skipping unparseable rows", () => {
    const index = buildDncIndex([
      { org_id: "a", normalized_phone: "98765 43210" },
      { org_id: "a", normalized_phone: "not-a-number" },
    ]);
    expect(index.get("a")).toEqual(new Set(["+919876543210"]));
  });

  it("matches a stored unnormalized contact value against index entries", () => {
    const index = buildDncIndex([
      { org_id: "a", normalized_phone: "+919876543210" },
    ]);
    expect(
      isDncListed("a", contact({ normalized_phone: "98765 43210" }), index)
    ).toBe(true);
  });
});

describe("isDncListed", () => {
  it("blocks on the contact flag regardless of entries", () => {
    expect(
      isDncListed("a", contact({ do_not_call: true }), new Map())
    ).toBe(true);
  });

  it("blocks on org entry match, normalizing raw numbers", () => {
    const index = buildDncIndex([
      { org_id: "a", normalized_phone: "+919876543210" },
    ]);
    expect(
      isDncListed(
        "a",
        contact({ normalized_phone: null, phone_number: "98765 43210" }),
        index
      )
    ).toBe(true);
    expect(isDncListed("a", contact(), new Map())).toBe(false);
  });

  it("never blocks unparseable numbers without a flag", () => {
    const index = buildDncIndex([
      { org_id: "a", normalized_phone: "+919876543210" },
    ]);
    expect(
      isDncListed(
        "a",
        contact({ phone_number: "xyz", normalized_phone: null }),
        index
      )
    ).toBe(false);
  });
});

describe("partitionContacts", () => {
  it("splits callable / dnc / skipped", () => {
    const index = buildDncIndex([
      { org_id: "a", normalized_phone: "+919876543211" },
    ]);
    const out = partitionContacts(
      "a",
      [
        contact({ id: "ok", phone_number: "+919876543212", normalized_phone: "+919876543212" }),
        contact({ id: "flag", do_not_call: true }),
        contact({
          id: "listed",
          phone_number: "+919876543211",
          normalized_phone: "+919876543211",
        }),
        contact({ id: "raw", phone_number: "???", normalized_phone: null }),
      ],
      index
    );
    expect(out.callable.map((c) => c.contact.id)).toEqual(["ok"]);
    expect(out.callable[0].normalized).toBe("+919876543212");
    expect(out.dnc.map((c) => c.id).sort()).toEqual(["flag", "listed"]);
    expect(out.skipped.map((c) => c.id)).toEqual(["raw"]);
  });
});
