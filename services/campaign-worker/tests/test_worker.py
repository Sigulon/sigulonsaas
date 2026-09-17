"""Campaign worker regression tests (stdlib unittest, fakes only).

Run from ``services/campaign-worker/``::

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import unittest
import hashlib
import json
from types import SimpleNamespace
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Fakes (implement exactly the client surface the worker uses)
# ---------------------------------------------------------------------------


class FakeResp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = len(data) if count is None else count


class FakeQuery:
    def __init__(self, table, rows):
        self._table = table
        self._rows = rows
        self._eq: list[tuple] = []
        self._in: list[tuple] = []
        self._lt: list[tuple] = []
        self._order = None
        self._desc = False
        self._limit = None
        self._single = "many"

    def select(self, *cols, **kwargs):
        self._want_count = kwargs.get("count")
        return self

    def eq(self, k, v):
        self._eq.append((k, v))
        return self

    def in_(self, k, vals):
        self._in.append((k, list(vals)))
        return self

    def lt(self, k, v):
        self._lt.append((k, v))
        return self

    def order(self, k, desc=False):
        self._order = k
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def maybe_single(self):
        self._single = "maybe"
        return self

    def single(self):
        self._single = "one"
        return self

    def _filtered(self):
        rows = list(self._rows)
        for k, v in self._eq:
            rows = [r for r in rows if r.get(k) == v]
        for k, vals in self._in:
            rows = [r for r in rows if r.get(k) in vals]
        for k, v in self._lt:
            rows = [r for r in rows if (r.get(k) or "") < v]
        if self._order:
            rows = sorted(rows, key=lambda r: r.get(self._order) or "",
                          reverse=self._desc)
        return rows

    def execute(self):
        rows = self._filtered()
        total = len(rows)
        if self._limit is not None:
            rows = rows[: self._limit]
        if self._single == "maybe":
            return FakeResp(rows[0] if rows else None)
        if self._single == "one":
            if not rows:
                raise RuntimeError("no rows")
            return FakeResp(rows[0])
        return FakeResp(rows, count=total)

    # -- writes ----------------------------------------------------------

    def insert(self, row):
        return _FakeInsert(self._table, row)

    def update(self, patch):
        return _FakeUpdate(self._table, self, patch)


class _FakeInsert(FakeQuery):
    def __init__(self, table, row):
        super().__init__(table, table.rows)
        self._pending = [dict(row)] if isinstance(row, dict) else [dict(r) for r in row]

    def execute(self):
        for r in self._pending:
            r.setdefault("id", f"gen-{len(self._table.rows)}")
            self._table.rows.append(r)
        rows = self._pending
        if self._single in ("maybe", "one"):
            return FakeResp(rows[0] if rows else None)
        return FakeResp(rows)


class _FakeUpdate:
    def __init__(self, table, query, patch):
        self._table = table
        self._query = query
        self._patch = patch

    def eq(self, k, v):
        self._query.eq(k, v)
        return self

    def execute(self):
        matched = self._query._filtered()
        for r in matched:
            r.update(self._patch)
        return FakeResp(matched)


class FakeTable:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *a, **k):
        return FakeQuery(self, self.rows).select(*a, **k)

    def insert(self, row):
        return _FakeInsert(self, row)

    def update(self, patch):
        return _FakeUpdate(self, FakeQuery(self, self.rows), patch)


class FakeMongo:
    def __init__(self, seed=None):
        self._tables = {name: FakeTable(list(rows)) for name, rows in (seed or {}).items()}

    def table(self, name):
        return self._tables.setdefault(name, FakeTable([]))


class FakeRedis:
    """GET/INCR/EXPIRE + ZSET + Lua-acquire semantics (no TTL simulation)."""

    def __init__(self):
        self.strings: dict[str, str] = {}
        self.zsets: dict[str, dict[str, float]] = {}
        self.lists: dict[str, list[str]] = {}

    # -- strings / counters ----------------------------------------------

    def get(self, key):
        return self.strings.get(key)

    def incr(self, key):
        self.strings[key] = str(int(self.strings.get(key, "0")) + 1)
        return int(self.strings[key])

    def decr(self, key):
        self.strings[key] = str(int(self.strings.get(key, "0")) - 1)
        return int(self.strings[key])

    def expire(self, key, ttl):
        return True

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.strings:
            return None
        self.strings[key] = value
        return True

    def delete(self, key):
        return 1 if self.strings.pop(key, None) is not None else 0

    def rpush(self, key, *values):
        self.lists.setdefault(key, []).extend(values)
        return len(self.lists[key])

    def pipeline(self):
        return _FakePipe(self)

    # -- zset ---------------------------------------------------------------

    def zadd(self, key, mapping):
        self.zsets.setdefault(key, {}).update(mapping)
        return len(mapping)

    def zrangebyscore(self, key, lo, hi, start=0, num=None):
        items = sorted(
            ((m, s) for m, s in self.zsets.get(key, {}).items() if lo <= s <= hi),
            key=lambda kv: kv[1],
        )
        members = [m for m, _ in items]
        return members[start:(start + num) if num is not None else None]

    def zrem(self, key, member):
        return 1 if self.zsets.get(key, {}).pop(member, None) is not None else 0

    # -- lua (mirrors ACQUIRE_SCRIPT semantics) -------------------------------

    def eval(self, script, numkeys, *keys_and_args):
        keys = list(keys_and_args[:numkeys])
        args = list(keys_and_args[numkeys:])
        for i, key in enumerate(keys):
            count = int(self.strings.get(key, "0"))
            if count >= int(args[i * 2]):
                return i + 1
        for i, key in enumerate(keys):
            self.incr(key)
        return 0


class _FakePipe:
    def __init__(self, client):
        self._client = client
        self._ops = []

    def decr(self, key):
        self._ops.append(key)
        return self

    def execute(self):
        return [self._client.decr(k) for k in self._ops]


def make_config(**overrides):
    base = dict(
        plivo_auth_id="MA111", plivo_auth_token="tok",
        encryption_secret="",
        public_web_url="https://web.test",
        poll_timeout_seconds=5, retry_batch_size=50,
        sweep_interval_seconds=120, stale_after_seconds=900,
        max_call_attempts=2, retry_base_seconds=300,
        global_max_concurrent=10, campaign_max_concurrent=5,
        number_max_concurrent=2, dial_timeout_seconds=15,
        global_slot_ttl=300, org_slot_ttl=300,
        campaign_slot_ttl=300, number_slot_ttl=60,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def seed_db():
    return {
        "organizations": [{"id": "o1", "max_concurrent_calls": 5}],
        "campaigns": [{"id": "c1", "org_id": "o1", "agent_id": "a1", "status": "running"}],
        "voice_agents": [{"id": "a1", "org_id": "o1", "status": "active",
                          "language": "te", "voice_id": "v1"}],
        "phone_numbers": [{"id": "n1", "org_id": "o1", "agent_id": "a1",
                           "phone_number": "+911234567890", "provider": "plivo",
                           "direction": "both"}],
        "contacts": [{"id": "ct1", "org_id": "o1", "phone_number": "98765 43210",
                      "normalized_phone": "+919876543210", "do_not_call": False}],
        "campaign_contacts": [{"campaign_id": "c1", "contact_id": "ct1",
                               "call_status": "queued", "attempt_count": 0,
                               "last_attempt_at": "2026-09-10T00:00:00+00:00",
                               "next_attempt_at": None}],
        "dnc_entries": [],
        "calls": [],
        "call_events": [],
    }


def make_ctx(db=None, **cfg_overrides):
    import worker as W

    return W.WorkerContext(
        config=make_config(**cfg_overrides),
        redis=FakeRedis(),
        database=FakeMongo(db if db is not None else seed_db()),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPhoneMirror(unittest.TestCase):
    def test_normalize_parity_with_ts(self):
        import phone as P

        self.assertEqual(P.normalize_phone("+91 98765 43210"), "+919876543210")
        self.assertEqual(P.normalize_phone("9876543210"), "+919876543210")
        self.assertEqual(P.normalize_phone("15551234567"), "+15551234567")
        self.assertEqual(P.normalize_phone("919876543210"), "+919876543210")
        self.assertIsNone(P.normalize_phone("12345"))
        self.assertIsNone(P.normalize_phone(None))
        self.assertTrue(P.same_line("09876543210", "+919876543210"))
        self.assertFalse(P.same_line("1234", "+911234567890"))


class TestQueueing(unittest.TestCase):
    def test_job_roundtrip_and_poison(self):
        import queueing as Q

        job = {"campaign_id": "c1", "contact_id": "ct1", "org_id": "o1", "attempt": 0}
        back = Q.decode_job(Q.encode_job(job))
        self.assertEqual(back, job)
        detailed = {
            **job,
            "agent_id": "a1",
            "single_call_id": "call-9",
            "normalized_phone": "+919876543210",
            "caller_number": "+911234567890",
            "max_attempts": 4,
        }
        self.assertEqual(Q.decode_job(Q.encode_job(detailed)), detailed)
        self.assertIsNone(Q.decode_job("not json"))
        self.assertIsNone(Q.decode_job('{"contact_id": "x"}'))

    def test_acquire_admits_and_refuses(self):
        import queueing as Q

        r = FakeRedis()
        ok, refusing = Q.acquire_layers(r, [("k1", 2, 60), ("k2", 1, 60)])
        self.assertTrue(ok)
        self.assertIsNone(refusing)
        ok, refusing = Q.acquire_layers(r, [("k1", 2, 60), ("k2", 1, 60)])
        self.assertFalse(ok)
        self.assertEqual(refusing, "k2")  # k1 still had room; k2 refused
        Q.release_layers(r, ["k1", "k2"])

    def test_retry_schedule_and_claim(self):
        import queueing as Q

        r = FakeRedis()
        job = {"campaign_id": None, "contact_id": "ct1", "org_id": "o1", "attempt": 1}
        Q.schedule_retry(r, job, -1)  # already due
        claimed = Q.claim_due_retries(r, 10)
        self.assertEqual(len(claimed), 1)
        self.assertEqual(claimed[0]["contact_id"], "ct1")
        self.assertEqual(Q.claim_due_retries(r, 10), [])  # claimed once

    def test_conc_keys(self):
        import queueing as Q

        keys = Q.conc_keys(org_id="o1", campaign_id="c1", number_digits="+911234567890")
        self.assertEqual(keys, ["sigulon:conc:global", "sigulon:conc:org:o1",
                               "sigulon:conc:campaign:c1", "sigulon:conc:number:1234567890"])
        single = Q.conc_keys(org_id="o1", campaign_id=None, number_digits="123")
        self.assertNotIn("sigulon:conc:campaign:None", single)


class TestDialer(unittest.TestCase):
    def test_urls_and_transient(self):
        import dialer as D

        self.assertEqual(
            D.answer_url_for_call("https://web.test", "call-1"),
            "https://web.test/api/webhooks/plivo/outbound-answer?call_id=call-1",
        )
        self.assertEqual(D.hangup_url("https://web.test/"),
                         "https://web.test/api/webhooks/plivo/status")
        self.assertEqual(
            D.hangup_url("https://web.test", "call/a"),
            "https://web.test/api/webhooks/plivo/status?call_id=call%2Fa",
        )
        self.assertTrue(D.is_transient(ConnectionError("connection reset")))
        self.assertTrue(D.is_transient(RuntimeError("Plivo dial HTTP 503")))
        self.assertFalse(D.is_transient(RuntimeError("unauthorized")))


class TestRetryDelay(unittest.TestCase):
    def test_backoff(self):
        import worker as W

        self.assertEqual(W.retry_delay_seconds(300, 1), 300)
        self.assertEqual(W.retry_delay_seconds(300, 2), 600)
        self.assertEqual(W.retry_delay_seconds(300, 3), 1200)
        self.assertEqual(W.retry_delay_seconds(300, 99), 86400)


class TestProcessJob(unittest.TestCase):
    def _cc(self, ctx, status="queued"):
        rows = ctx.database.table("campaign_contacts").rows
        return next(r for r in rows if r["contact_id"] == "ct1")

    def test_happy_path_dials(self):
        import worker as W

        ctx = make_ctx()
        with patch("dialer.dial", return_value={"request_uuid": "req-1"}) as d:
            disp = W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0})
        self.assertEqual(disp, "dialed")
        d.assert_called_once()
        _, kwargs = d.call_args
        self.assertEqual(kwargs["to_number"], "+919876543210")
        self.assertIn("call_id=", kwargs["answer_url"])
        calls = ctx.database.table("calls").rows
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["status"], "dialing")
        self.assertTrue(calls[0]["cartesia_call_id"].startswith("plivo:out:"))
        cc = self._cc(ctx)
        self.assertEqual(cc["call_status"], "dialing")
        self.assertEqual(cc["attempt_count"], 1)

    def test_workspace_plivo_credentials_override_platform_fallback(self):
        import worker as W
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        db = seed_db()
        secret = "a-unique-test-secret-that-is-longer-than-32-characters"
        iv = bytes(range(16))
        key = hashlib.sha256(secret.encode("utf-8")).digest()
        plaintext = json.dumps({"authId": "MAworkspace", "authToken": "workspace-token"}).encode("utf-8")
        encrypted_with_tag = AESGCM(key).encrypt(iv, plaintext, None)
        db["provider_accounts"] = [{
            "org_id": "o1", "provider": "plivo", "status": "active",
            "credentials_encrypted": f"{encrypted_with_tag[:-16].hex()}:{encrypted_with_tag[-16:].hex()}",
            "encryption_iv": iv.hex(),
        }]
        ctx = make_ctx(db, encryption_secret=secret)

        with patch("dialer.dial", return_value={"request_uuid": "req-byoc"}) as dial:
            disposition = W.process_job(ctx, {
                "campaign_id": "c1", "contact_id": "ct1", "org_id": "o1", "attempt": 0,
            })

        self.assertEqual(disposition, "dialed")
        _, kwargs = dial.call_args
        self.assertEqual(kwargs["auth_id"], "MAworkspace")
        self.assertEqual(kwargs["auth_token"], "workspace-token")

    def test_dnc_terminalizes(self):
        import worker as W

        db = seed_db()
        db["contacts"][0]["do_not_call"] = True
        ctx = make_ctx(db)
        with patch("dialer.dial") as d:
            disp = W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0})
        self.assertEqual(disp, "terminal:dnc")
        d.assert_not_called()
        self.assertEqual(self._cc(ctx)["call_status"], "dnc")

    def test_dnc_entries_table_checked(self):
        import worker as W

        db = seed_db()
        db["dnc_entries"].append({"org_id": "o1", "normalized_phone": "+919876543210"})
        ctx = make_ctx(db)
        with patch("dialer.dial") as d:
            self.assertEqual(W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                                 "org_id": "o1", "attempt": 0}),
                             "terminal:dnc")
            d.assert_not_called()

    def test_exhausted_attempts(self):
        import worker as W

        db = seed_db()
        db["campaign_contacts"][0]["attempt_count"] = 2  # max is 2 in test cfg
        ctx = make_ctx(db)
        with patch("dialer.dial") as d:
            disp = W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0})
        self.assertEqual(disp, "terminal:failed")
        d.assert_not_called()

    def test_dial_failure_retries_then_fails(self):
        import worker as W

        ctx = make_ctx()
        with patch("dialer.dial", side_effect=RuntimeError("Plivo dial HTTP 500")):
            disp = W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0})
        self.assertEqual(disp, "retry_scheduled")
        cc = self._cc(ctx)
        self.assertEqual(cc["call_status"], "pending")
        self.assertEqual(cc["attempt_count"], 1)
        self.assertIsNotNone(cc["next_attempt_at"])
        # Second failure exhausts (max 2) → terminal.
        with patch("dialer.dial", side_effect=RuntimeError("Plivo dial HTTP 500")):
            disp = W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0})
        self.assertEqual(disp, "terminal:failed")

    def test_paused_campaign_parks(self):
        import worker as W

        db = seed_db()
        db["campaigns"][0]["status"] = "paused"
        ctx = make_ctx(db)
        with patch("dialer.dial") as d:
            self.assertEqual(W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                                 "org_id": "o1", "attempt": 0}),
                             "paused")
            d.assert_not_called()
        self.assertEqual(self._cc(ctx)["call_status"], "pending")

    def test_slot_refusal_defers(self):
        import worker as W

        ctx = make_ctx()
        ctx.redis.strings["sigulon:conc:global"] = "10"  # at cap
        with patch("dialer.dial") as d:
            self.assertEqual(W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                                 "org_id": "o1", "attempt": 0}),
                             "retry_scheduled")
            d.assert_not_called()

    def test_single_dial_reuses_row(self):
        import worker as W

        db = seed_db()
        db["calls"].append({"id": "call-9", "org_id": "o1", "agent_id": "a1",
                            "contact_id": "ct1", "campaign_id": None,
                            "status": "queued", "direction": "outbound",
                            "created_at": "2026-09-10T00:00:00+00:00"})
        db["calls"].append({"id": "call-newer", "org_id": "o1", "agent_id": "a1",
                            "contact_id": "ct1", "campaign_id": None,
                            "status": "queued", "direction": "outbound",
                            "created_at": "2026-09-11T00:00:00+00:00"})
        # Single jobs have no campaign_contacts row.
        db["campaign_contacts"] = []
        ctx = make_ctx(db)
        with patch("dialer.dial", return_value={"request_uuid": "req-9"}):
            disp = W.process_job(ctx, {"campaign_id": None, "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0,
                                       "single_call_id": "call-9", "max_attempts": 1})
        self.assertEqual(disp, "dialed")
        calls = ctx.database.table("calls").rows
        self.assertEqual(len(calls), 2)  # no third row was minted
        self.assertEqual(calls[0]["status"], "dialing")
        self.assertEqual(calls[1]["status"], "queued")

    def test_single_dial_preflight_failure_cancels_exact_row(self):
        import worker as W

        db = seed_db()
        db["contacts"][0]["do_not_call"] = True
        db["campaign_contacts"] = []
        db["calls"].append({"id": "call-9", "org_id": "o1", "agent_id": "a1",
                            "contact_id": "ct1", "campaign_id": None,
                            "status": "queued", "direction": "outbound",
                            "created_at": "2026-09-10T00:00:00+00:00"})
        ctx = make_ctx(db)
        with patch("dialer.dial") as dial:
            disp = W.process_job(ctx, {"campaign_id": None, "contact_id": "ct1",
                                       "org_id": "o1", "attempt": 0,
                                       "single_call_id": "call-9", "max_attempts": 1})
        self.assertEqual(disp, "terminal:dnc")
        dial.assert_not_called()
        self.assertEqual(ctx.database.table("calls").rows[0]["status"], "cancelled")

    def test_org_mismatch_drops(self):
        import worker as W

        ctx = make_ctx()
        with patch("dialer.dial") as d:
            self.assertEqual(W.process_job(ctx, {"campaign_id": "c1", "contact_id": "ct1",
                                                 "org_id": "evil", "attempt": 0}),
                             "dropped")
            d.assert_not_called()


class TestSweeps(unittest.TestCase):
    def test_active_page_blocks_a_refill(self):
        import queueing as Q
        import worker as W
        from datetime import datetime, timezone

        db = seed_db()
        db["campaign_contacts"].append({
            "id": "cc2", "campaign_id": "c1", "contact_id": "ct2",
            "call_status": "pending", "attempt_count": 0,
            "last_attempt_at": None, "next_attempt_at": None,
        })
        ctx = make_ctx(db)

        stats = W.sweep_campaign(
            ctx, "c1", datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        )

        self.assertEqual(stats.get("dispatched"), 0)
        self.assertEqual(db["campaign_contacts"][1]["call_status"], "pending")
        self.assertNotIn(Q.QUEUE_KEY, ctx.redis.lists)

    def test_drained_page_dispatches_the_next_pending_page(self):
        import queueing as Q
        import worker as W
        from datetime import datetime, timezone

        db = seed_db()
        db["campaign_contacts"][0]["call_status"] = "completed"
        db["contacts"].append({"id": "ct2", "org_id": "o1", "phone_number": "9123456789",
                               "normalized_phone": "+919123456789", "do_not_call": False})
        db["campaign_contacts"].append({
            "id": "cc2", "campaign_id": "c1", "contact_id": "ct2",
            "call_status": "pending", "attempt_count": 0,
            "last_attempt_at": None, "next_attempt_at": None,
        })
        ctx = make_ctx(db)

        stats = W.sweep_campaign(
            ctx, "c1", datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        )

        self.assertEqual(stats.get("dispatched"), 1)
        self.assertEqual(db["campaign_contacts"][1]["call_status"], "queued")
        self.assertEqual(len(ctx.redis.lists[Q.QUEUE_KEY]), 1)
        job = Q.decode_job(ctx.redis.lists[Q.QUEUE_KEY][0])
        self.assertEqual(job["contact_id"], "ct2")
        self.assertEqual(job["max_attempts"], 2)

    def test_stale_queued_requeues(self):
        import worker as W
        from datetime import datetime, timezone

        ctx = make_ctx()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        stats = W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(stats.get("requeued"), 1)
        import queueing as Q

        due = Q.claim_due_retries(ctx.redis, 10)
        self.assertEqual(len(due), 1)
        self.assertEqual(due[0]["contact_id"], "ct1")

    def test_stale_dialing_heals_from_terminal_call(self):
        import worker as W
        from datetime import datetime, timezone

        db = seed_db()
        db["campaign_contacts"][0]["call_status"] = "dialing"
        db["calls"].append({"id": "call-1", "campaign_id": "c1", "contact_id": "ct1",
                            "status": "completed",
                            "created_at": "2026-09-10T00:00:00+00:00"})
        ctx = make_ctx(db)
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        stats = W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(stats.get("healed"), 1)
        cc = ctx.database.table("campaign_contacts").rows[0]
        self.assertEqual(cc["call_status"], "completed")

    def test_stale_dialing_without_call_fails(self):
        import worker as W
        from datetime import datetime, timezone

        db = seed_db()
        db["campaign_contacts"][0]["call_status"] = "dialing"
        ctx = make_ctx(db)
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        stats = W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(stats.get("failed_stale"), 1)
        cc = ctx.database.table("campaign_contacts").rows[0]
        self.assertEqual(cc["call_status"], "failed")

    def test_drained_campaign_completes(self):
        import worker as W
        from datetime import datetime, timezone

        db = seed_db()
        db["campaign_contacts"][0]["call_status"] = "completed"
        ctx = make_ctx(db)
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(ctx.database.table("campaigns").rows[0]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
