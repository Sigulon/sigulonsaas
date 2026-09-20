/**
 * E.164 phone normalization — the single canonicalizer for all ingress.
 *
 * Rules mirror the canonical MongoDB schema normalization so data layers
 * and TS agree on every input:
 *   - explicit '+' → keep digits as-is (`+91 98765 43210` → `+919876543210`)
 *   - 11 digits starting with 1 → NANP (`15551234567` → `+15551234567`)
 *   - bare 10 digits → India, the primary market (`9876543210` → `+919876543210`)
 *   - 12 digits starting with 91 → India (`919876543210` → `+919876543210`)
 *   - anything else → null (caller decides: reject or store raw)
 *
 * Phase 6 reuses this for outbound (campaign CSVs, single-call dial, DNC).
 */

/** Normalize to E.164, or null when the input is unparseable. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    if (digits.length < 7 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  return null;
}

/** Digits only, no leading '+'. Empty string for empty input. */
export function digitsOf(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

/**
 * Last N digits of a number — the match key for `phone_numbers` rows, whose
 * stored format varies (E.164, spaced, dashed). Country codes and trunk
 * prefixes differ per sender, but the trailing subscriber digits don't.
 */
export function lastDigits(raw: string | null | undefined, n = 10): string {
  const digits = digitsOf(raw);
  return digits.slice(-n);
}

/**
 * True when two numbers plausibly address the same line: equal once both
 * are reduced to their last 10 digits (and both sides have ≥10 digits, so
 * short codes never collide with full numbers).
 */
export function sameLine(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const da = digitsOf(a);
  const db = digitsOf(b);
  if (da.length < 10 || db.length < 10) return false;
  return da.slice(-10) === db.slice(-10);
}
