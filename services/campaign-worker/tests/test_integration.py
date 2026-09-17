"""Cross-module integration: seed -> queue -> dial -> mirror -> sweep.

Exercises queueing + worker + store + dialer together against fakes
(no Redis/Mongo/Plivo): a campaign contact flows from `queued` to
`dialing` to terminal, and the drained campaign completes — the same
shape the web status webhook + sweeps produce in production.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

try:
    from .test_worker import FakeRedis, make_ctx, seed_db
except ImportError:
    from test_worker import FakeRedis, make_ctx, seed_db

import queueing as Q
import store as S
import worker as W


class TestCampaignLifecycle(unittest.TestCase):
    def test_queued_to_dialed_to_completed(self):
        ctx = make_ctx()

        # 1. Web enqueued the job; worker pops and dials.
        job = {"campaign_id": "c1", "contact_id": "ct1",
               "org_id": "o1", "attempt": 0}
        with patch("dialer.dial", return_value={"request_uuid": "req-1"}):
            self.assertEqual(W.process_job(ctx, job), "dialed")

        calls = ctx.database.table("calls").rows
        self.assertEqual(len(calls), 1)
        call = calls[0]
        self.assertEqual(call["status"], "dialing")
        self.assertEqual(call["campaign_id"], "c1")
        cc = ctx.database.table("campaign_contacts").rows[0]
        self.assertEqual((cc["call_status"], cc["attempt_count"]), ("dialing", 1))

        # Governor slots were taken (ride their TTLs on success).
        self.assertGreater(
            int(ctx.redis.strings.get("sigulon:conc:campaign:c1", "0")), 0)

        # 2. Status webhook mirrors onto the contact (web-side behavior).
        S.set_contact_status(ctx.database, "c1", "ct1", "completed")

        # 3. Sweep drains the campaign.
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(
            ctx.database.table("campaigns").rows[0]["status"], "completed")

    def test_failed_dial_retries_then_sweep_heals(self):
        ctx = make_ctx()
        job = {"campaign_id": "c1", "contact_id": "ct1",
               "org_id": "o1", "attempt": 0}

        # Dial API down twice (max attempts = 2 in test config).
        with patch("dialer.dial", side_effect=RuntimeError("Plivo dial HTTP 500")):
            self.assertEqual(W.process_job(ctx, job), "retry_scheduled")
            self.assertEqual(W.process_job(ctx, job), "terminal:failed")

        cc = ctx.database.table("campaign_contacts").rows[0]
        self.assertEqual(cc["call_status"], "failed")
        # One failed row per dial attempt — never an orphan `queued` row.
        rows = ctx.database.table("calls").rows
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r["status"] == "failed" for r in rows))

        # Sweep completes the drained campaign.
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(
            ctx.database.table("campaigns").rows[0]["status"], "completed")

    def test_retry_zset_roundtrip_through_queueing(self):
        redis = FakeRedis()
        job = {"campaign_id": "c1", "contact_id": "ct1",
               "org_id": "o1", "attempt": 0}
        Q.schedule_retry(redis, job, -1)
        claimed = Q.claim_due_retries(redis, 10)
        self.assertEqual(len(claimed), 1)

        ctx = make_ctx()
        ctx.redis = redis
        with patch("dialer.dial", return_value={"request_uuid": "req-9"}):
            self.assertEqual(W.process_job(ctx, claimed[0]), "dialed")


if __name__ == "__main__":
    unittest.main()
