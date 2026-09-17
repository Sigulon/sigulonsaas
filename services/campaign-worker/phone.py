"""E.164 normalization — Python mirror of `src/lib/phone.ts`.

Rules (identical to the TS side and the Phase 2 SQL backfill):
  explicit '+'            → keep digits as-is
  11 digits starting 1    → NANP
  bare 10 digits          → India (+91, primary market)
  12 digits starting 91   → India
  anything else           → None
"""

from __future__ import annotations

from typing import Optional


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    digits = "".join(ch for ch in trimmed if ch.isdigit())
    if not digits:
        return None
    if trimmed.startswith("+"):
        return f"+{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return None


def digits_of(raw: Optional[str]) -> str:
    return "".join(ch for ch in (raw or "") if ch.isdigit())


def last_digits(raw: Optional[str], n: int = 10) -> str:
    return digits_of(raw)[-n:]


def same_line(a: Optional[str], b: Optional[str]) -> bool:
    da, db = digits_of(a), digits_of(b)
    if len(da) < 10 or len(db) < 10:
        return False
    return da[-10:] == db[-10:]


__all__ = ["digits_of", "last_digits", "normalize_phone", "same_line"]
