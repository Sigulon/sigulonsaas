"""Fix #2 failing tests: double-dial from stale_queued requeue + no in-flight guard.

Run from ``services/campaign-worker/``::

    py -m unittest tests.test_fix2_double_dial -v
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

try:
    from .test_worker import FakeRedis, make_ctx, seed_db
except ImportError:
    from test_worker import FakeRedis, make_ctx, seed_db


class TestDoubleDial(unittest.TestCase):
    def test_same_contact_twice_dials_once(self):
        import worker as W

        ctx = make_ctx()
        job = {"campaign_id": "c1", "contact_id": "ct1",
               "org_id": "o1", "attempt": 0}
        with patch("dialer.dial",
                   return_value={"room": "sigulon-call-x", "dispatch_id": "d-1"}) as d:
            first = W.process_job(ctx, dict(job))
            second = W.process_job(ctx, dict(job))
        self.assertEqual(first, "dialed")
        # Second identical job must NOT dial again (in-flight guard).
        self.assertEqual(d.call_count, 1,
                         "same contact enqueued twice must dial exactly once")
        self.assertIn(second, ("dropped", "retry_scheduled", "paused",
                               "terminal:failed"),
                      "duplicate job must not dial")

    def test_sweep_mid_dial_creates_no_second_job(self):
        import queueing as Q
        import worker as W

        ctx = make_ctx()
        job = {"campaign_id": "c1", "contact_id": "ct1",
               "org_id": "o1", "attempt": 0}
        with patch("dialer.dial",
                   return_value={"room": "sigulon-call-x", "dispatch_id": "d-1"}):
            self.assertEqual(W.process_job(ctx, dict(job)), "dialed")
        # Job is mid-dial (contact=dialing, fresh timestamp). Immediate sweep
        # must not requeue a second job for the same contact.
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        # Restamp to now to simulate "just dialed".
        import store as S
        S.set_contact_status(ctx.database, "c1", "ct1", "dialing")
        # Drain any retries scheduled by the dial itself (none expected).
        Q.claim_due_retries(ctx.redis, 10)
        stats = W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(stats.get("requeued", 0), 0,
                         "sweep mid-dial must not requeue")
        due = Q.claim_due_retries(ctx.redis, 10)
        self.assertEqual(due, [],
                         "no second job may be created while dial in flight")


class TestStaleQueuedCutoff(unittest.TestCase):
    def test_queued_fresh_not_stale_old_is(self):
        import store as S
        from datetime import timedelta

        ctx = make_ctx()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        cutoff = (now - timedelta(seconds=900)).isoformat()
        rows = ctx.database.table("campaign_contacts").rows
        rows[0]["call_status"] = "queued"
        rows[0]["last_attempt_at"] = now.isoformat()  # fresh
        fresh = S.stale_contacts(ctx.database, "c1", ("queued",), cutoff)
        self.assertEqual(fresh, [])
        rows[0]["last_attempt_at"] = (
            now - timedelta(seconds=3600)).isoformat()  # old
        old = S.stale_contacts(ctx.database, "c1", ("queued",), cutoff)
        self.assertEqual(len(old), 1)


class TestRetryIdempotent(unittest.TestCase):
    def test_same_logical_retry_scheduled_once(self):
        import queueing as Q

        r = FakeRedis()
        base = {"campaign_id": "c1", "contact_id": "ct1",
                "org_id": "o1", "attempt": 0}
        job1 = dict(base, max_attempts=2)
        job2 = dict(base, max_attempts=3)  # same logical retry, re-encoded
        Q.schedule_retry(r, job1, 60)
        Q.schedule_retry(r, job2, 60)
        members = list(r.zsets.get(Q.RETRY_ZSET, {}).keys())
        self.assertEqual(len(members), 1,
                         "duplicate retry for (contact, attempt) must not duplicate")


if __name__ == "__main__":
    unittest.main()
