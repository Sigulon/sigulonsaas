import { describe, expect, it } from "vitest";
import { digitsOf, lastDigits, normalizePhone, sameLine } from "../phone";

describe("normalizePhone", () => {
  it("keeps explicit + numbers as digits-only E.164", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("treats 11-digit leading-1 as NANP", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
  });

  it("defaults bare 10-digit input to India (+91)", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
  });

  it("handles 12-digit 91-prefixed input", () => {
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });

  it("returns null for unparseable input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });

  it("rejects +-prefixed numbers outside 7..15 digits", () => {
    expect(normalizePhone("+1")).toBeNull();
    expect(normalizePhone("+123456")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });
});

describe("digitsOf / lastDigits", () => {
  it("strips to digits", () => {
    expect(digitsOf("+91 98765-43210")).toBe("919876543210");
    expect(digitsOf(null)).toBe("");
  });

  it("takes trailing digits", () => {
    expect(lastDigits("+919876543210")).toBe("9876543210");
    expect(lastDigits("+15551234567", 5)).toBe("34567");
  });
});

describe("sameLine", () => {
  it("matches across formatting and country-prefix variants", () => {
    expect(sameLine("+91 98765 43210", "+919876543210")).toBe(true);
    expect(sameLine("09876543210", "+919876543210")).toBe(true);
    expect(sameLine("+919876543210", "+911234567890")).toBe(false);
  });

  it("never matches short codes against full numbers", () => {
    expect(sameLine("1234", "+911234567890")).toBe(false);
    expect(sameLine(null, "+911234567890")).toBe(false);
  });
});
