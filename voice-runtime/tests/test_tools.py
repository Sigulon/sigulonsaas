"""Tool helper tests (pure — MongoDB/Plivo are not touched)."""

from __future__ import annotations

import unittest
from datetime import timezone

from tools import TOOL_REGISTRY
from tools.common import overlaps, parse_datetime
from tools.leads import _normalize


class TestRegistryParity(unittest.TestCase):
    def test_default_enabled_tools_resolve(self):
        # Agents ship with enabled_tools=[check_availability, pricing_lookup]
        # (migration + web defaults) — both MUST exist or calls run muteless.
        for name in ("check_availability", "pricing_lookup"):
            self.assertIn(name, TOOL_REGISTRY)

    def test_all_expected_tools_registered(self):
        self.assertEqual(
            sorted(TOOL_REGISTRY.keys()),
            ["book_appointment", "check_availability", "create_lead",
             "pricing_lookup", "transfer_call"],
        )


class TestParseDatetime(unittest.TestCase):
    def test_iso_and_space_forms(self):
        parsed = parse_datetime("2026-09-12 15:30")
        assert parsed is not None
        self.assertEqual((parsed.year, parsed.month, parsed.day,
                          parsed.hour, parsed.minute), (2026, 9, 12, 15, 30))
        self.assertEqual(parsed.tzinfo, timezone.utc)

    def test_offset_converted_to_utc(self):
        parsed = parse_datetime("2026-09-12T15:30:00+05:30")
        assert parsed is not None
        self.assertEqual((parsed.hour, parsed.minute), (10, 0))

    def test_garbage_returns_none(self):
        self.assertIsNone(parse_datetime("tomorrow-ish"))
        self.assertIsNone(parse_datetime(""))
        self.assertIsNone(parse_datetime(None))  # type: ignore[arg-type]


class TestOverlaps(unittest.TestCase):
    def test_overlap_matrix(self):
        from datetime import datetime

        def dt(h, m=0):
            return datetime(2026, 9, 12, h, m, tzinfo=timezone.utc)

        self.assertTrue(overlaps(dt(15), dt(16), dt(15, 30), dt(16, 30)))
        self.assertTrue(overlaps(dt(15), dt(17), dt(15, 30), dt(15, 45)))
        self.assertFalse(overlaps(dt(15), dt(16), dt(16), dt(17)))  # touching
        self.assertFalse(overlaps(dt(15), dt(16), dt(17), dt(18)))


class TestLeadNormalize(unittest.TestCase):
    def test_parity_with_web(self):
        self.assertEqual(_normalize("9876543210"), "+919876543210")
        self.assertEqual(_normalize("+1 (555) 123-4567"), "+15551234567")
        self.assertIsNone(_normalize("xyz"))
        self.assertIsNone(_normalize(""))


if __name__ == "__main__":
    unittest.main()
