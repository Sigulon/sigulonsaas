"""Fix #3 failing tests: single-dial retries dead after first failure.

Run from ``services/campaign-worker/``::

    py -m unittest tests.test_fix3_single_retry -v
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

try:
    from .test_worker import make_ctx, seed_db
except ImportError:
    from test_worker import make_ctx, seed_db


def seed_single(db, call_id="call-9"):
    db["calls"].append({
        "id": call_id, "org_id": "o1", "agent_id": "a1",
        "contact_id": "ct1", "campaign_id": None,
        "status": "queued", "direction": "outbound",
        "created_at": "2026-09-10T00:00:00+00:00",
    })
    db["campaign_contacts"] = []


class TestSingleRetry(unittest.TestCase):
    def _drive(self, ctx, first_job, dial_side_effect):
        """Process jobs through claim_due_retries until terminal/dropped."""
        import queueing as Q
        import worker as W

        dispositions = []
        dials = 0
        job = first_job
        with patch("dialer.dial", side_effect=dial_side_effect) as d:
            while job is not None:
                disp = W.process_job(ctx, dict(job))
                dispositions.append(disp)
                if disp == "retry_scheduled":
                    due = Q.claim_due_retries(ctx.redis, 10)
                    job = due[0] if due else None
                else:
                    job = None
            dials = d.call_count
        return dispositions, dials

    def test_three_failures_then_failed(self):
        db = seed_db()
        seed_single(db)
        ctx = make_ctx(db, retry_base_seconds=0, max_call_attempts=3)
        job0 = {"campaign_id": None, "contact_id": "ct1", "org_id": "o1",
                "attempt": 0, "single_call_id": "call-9", "max_attempts": 3}
        with patch("dialer.dial", side_effect=RuntimeError("down")) as d:
            import queueing as Q
            import worker as W
            dispositions = []
            job = dict(job0)
            for _ in range(5):  # guard against infinite loop
                disp = W.process_job(ctx, dict(job))
                dispositions.append(disp)
                if disp != "retry_scheduled":
                    break
                due = Q.claim_due_retries(ctx.redis, 10)
                self.assertTrue(due, "retry must be scheduled")
                job = due[0]
            dials = d.call_count
        self.assertEqual(dials, 3, "max_attempts=3 must dial 3 times")
        self.assertTrue(dispositions[-1].startswith("terminal:"),
                        f"must terminalize, got {dispositions}")
        rows = ctx.database.table("calls").rows
        self.assertEqual(len(rows), 3, "one row per attempt (no row reuse)")
        self.assertTrue(all(r["status"] == "failed" for r in rows),
                        f"all attempts failed, got {[r['status'] for r in rows]}")

    def test_succeeds_on_try_two(self):
        db = seed_db()
        seed_single(db)
        ctx = make_ctx(db, retry_base_seconds=0, max_call_attempts=3)
        job0 = {"campaign_id": None, "contact_id": "ct1", "org_id": "o1",
                "attempt": 0, "single_call_id": "call-9", "max_attempts": 3}
        with patch("dialer.dial", side_effect=[
                RuntimeError("down"),
                {"room": "sigulon-call-y", "dispatch_id": "d-9"},
        ]) as d:
            import queueing as Q
            import worker as W
            first = W.process_job(ctx, dict(job0))
            self.assertEqual(first, "retry_scheduled")
            # Retry row links back to the failed attempt (checked before
            # the success path's metadata write; full merge lands in #13).
            queued = [r for r in ctx.database.table("calls").rows
                      if r["id"] != "call-9"]
            self.assertEqual(len(queued), 1)
            meta = queued[0].get("metadata") or {}
            self.assertIn(meta.get("retry_of") or meta.get("parent_call_id"),
                          ("call-9",),
                          "retry row must link to parent attempt")
            due = Q.claim_due_retries(ctx.redis, 10)
            self.assertEqual(len(due), 1)
            second = W.process_job(ctx, dict(due[0]))
            self.assertEqual(second, "dialed")
            self.assertEqual(d.call_count, 2)
        rows = ctx.database.table("calls").rows
        self.assertEqual(len(rows), 2)
        by_id = {r["id"]: r for r in rows}
        self.assertEqual(by_id["call-9"]["status"], "failed")
        dialed = [r for r in rows if r["id"] != "call-9"][0]
        self.assertEqual(dialed["status"], "dialing")


if __name__ == "__main__":
    unittest.main()
