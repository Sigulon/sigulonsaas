"""Fix #1 failing tests: sweep kills live calls (cutoff ignored, answered failed).

Run from ``services/campaign-worker/``::

    py -m unittest tests.test_fix1_sweep -v
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


# ---------------------------------------------------------------------------
# Minimal PyMongo-like fakes (no table() method -> Mongo code path)
# ---------------------------------------------------------------------------

def _get_path(doc, dotted):
    cur = doc
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True


def _matches(doc, filt):
    for key, cond in (filt or {}).items():
        if key == "$or":
            if not any(_matches(doc, sub) for sub in cond):
                return False
            continue
        val, present = _get_path(doc, key)
        if isinstance(cond, dict):
            for op, opval in cond.items():
                if op == "$in":
                    if val not in opval:
                        return False
                elif op == "$lt":
                    if val is None:
                        return False
                    try:
                        if not (val < opval):
                            return False
                    except TypeError:
                        return False
                elif op == "$gt":
                    if val is None:
                        return False
                    try:
                        if not (val > opval):
                            return False
                    except TypeError:
                        return False
                elif op == "$exists":
                    if bool(opval) != present:
                        return False
                else:
                    return False
        else:
            # {"field": None} matches null AND missing in Mongo.
            if cond is None:
                if val is not None:
                    return False
            elif val != cond:
                return False
    return True


class FakeCursor(list):
    def limit(self, n):
        return FakeCursor(list(self)[:n])


class FakeMongoCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, filt=None):
        return FakeCursor([d for d in self.docs if _matches(d, filt or {})])

    def find_one(self, filt=None, sort=None):
        rows = [d for d in self.docs if _matches(d, filt or {})]
        if sort:
            for sk, direction in reversed(sort):
                rows = sorted(rows, key=lambda d: d.get(sk) or datetime.min.replace(tzinfo=timezone.utc),
                              reverse=(direction < 0))
        return rows[0] if rows else None

    def update_one(self, filt, update):
        doc = self.find_one(filt)
        if not doc:
            return
        for op, changes in (update or {}).items():
            if op == "$set":
                for k, v in changes.items():
                    parts = k.split(".")
                    cur = doc
                    for p in parts[:-1]:
                        cur = cur.setdefault(p, {})
                    cur[parts[-1]] = v

    def update_many(self, filt, update):
        for doc in [d for d in self.docs if _matches(d, filt or {})]:
            for op, changes in (update or {}).items():
                if op == "$set":
                    for k, v in changes.items():
                        parts = k.split(".")
                        cur = doc
                        for p in parts[:-1]:
                            cur = cur.setdefault(p, {})
                        cur[parts[-1]] = v

    def count_documents(self, filt):
        return len([d for d in self.docs if _matches(d, filt or {})])

    def find_one_and_update(self, filt, update, sort=None, return_document=None):
        rows = [d for d in self.docs if _matches(d, filt or {})]
        if sort:
            for sk, direction in reversed(sort):
                rows = sorted(rows, key=lambda d: d.get(sk) or "",
                              reverse=(direction < 0))
        if not rows:
            return None
        doc = rows[0]
        for op, changes in (update or {}).items():
            if op == "$set":
                for k, v in changes.items():
                    parts = k.split(".")
                    cur = doc
                    for p in parts[:-1]:
                        cur = cur.setdefault(p, {})
                    cur[parts[-1]] = v
        return doc

    def insert_one(self, doc):
        import copy
        d = copy.deepcopy(doc)
        d.setdefault("_id", f"gen-{len(self.docs)}")
        self.docs.append(d)
        return SimpleNamespace(inserted_id=d["_id"])


class FakeMongoClient:
    """No .table() -> store.py takes the Mongo path."""

    def __init__(self):
        self.campaign_contacts = FakeMongoCollection([])
        self.calls = FakeMongoCollection([])
        self.campaigns = FakeMongoCollection([])


class FakeRedis:
    def __init__(self):
        self.strings = {}
        self.zsets = {}
        self.lists = {}

    def zadd(self, key, mapping):
        self.zsets.setdefault(key, {}).update(mapping)
        return len(mapping)

    def zrangebyscore(self, key, lo, hi, start=0, num=None):
        items = sorted(((m, s) for m, s in self.zsets.get(key, {}).items() if lo <= s <= hi),
                       key=lambda kv: kv[1])
        members = [m for m, _ in items]
        return members[start:(start + num) if num is not None else None]

    def zrem(self, key, member):
        return 1 if self.zsets.get(key, {}).pop(member, None) is not None else 0

    def rpush(self, key, *values):
        self.lists.setdefault(key, []).extend(values)
        return len(self.lists[key])

    def get(self, key):
        return self.strings.get(key)

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.strings:
            return None
        self.strings[key] = value
        return True

    def delete(self, key):
        return 1 if self.strings.pop(key, None) is not None else 0

    def eval(self, *a, **k):
        return 0

    def pipeline(self):
        client = self

        class P:
            def decr(self, key):
                return self

            def execute(self):
                return []
        return P()


def make_ctx(db):
    import worker as W
    cfg = SimpleNamespace(
        stale_after_seconds=900,
        max_call_attempts=3,
        retry_base_seconds=300,
        global_max_concurrent=10,
        campaign_max_concurrent=5,
        number_max_concurrent=2,
        dial_timeout_seconds=15,
        global_slot_ttl=300, org_slot_ttl=300,
        campaign_slot_ttl=300, number_slot_ttl=60,
        livekit_url="wss://test", livekit_api_key="k",
        livekit_api_secret="s", livekit_agent_name="a",
        max_call_seconds=1800,
    )
    # max_call_seconds may not exist yet on real config; tolerate absence.
    return W.WorkerContext(config=cfg, redis=FakeRedis(), database=db)


class TestFix1MongoCutoff(unittest.TestCase):
    def test_fresh_dialing_contact_not_stale(self):
        import store as S
        db = FakeMongoClient()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        cutoff = (now - timedelta(seconds=900)).isoformat()
        db.campaign_contacts.docs.extend([
            {"_id": "cc-fresh", "campaignId": "c1", "contactId": "ct-fresh",
             "callStatus": "dialing", "attemptCount": 1,
             "lastAttemptAt": now,  # just dialed
             "updatedAt": now},
            {"_id": "cc-old", "campaignId": "c1", "contactId": "ct-old",
             "callStatus": "dialing", "attemptCount": 1,
             "lastAttemptAt": now - timedelta(seconds=3600),
             "updatedAt": now - timedelta(seconds=3600)},
        ])
        rows = S.stale_contacts(db, "c1", ("dialing", "ringing", "calling"), cutoff)
        ids = {r["contact_id"] for r in rows}
        self.assertNotIn("ct-fresh", ids,
                         "fresh dialing contact must NOT be stale")
        self.assertIn("ct-old", ids)

    def test_missing_last_attempt_requires_old_updated(self):
        import store as S
        db = FakeMongoClient()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        cutoff = (now - timedelta(seconds=900)).isoformat()
        db.campaign_contacts.docs.extend([
            {"_id": "cc-nolast-fresh", "campaignId": "c1", "contactId": "ct-nolast-fresh",
             "callStatus": "dialing", "attemptCount": 0,
             "updatedAt": now, "createdAt": now},
            {"_id": "cc-nolast-old", "campaignId": "c1", "contactId": "ct-nolast-old",
             "callStatus": "dialing", "attemptCount": 0,
             "updatedAt": now - timedelta(seconds=3600),
             "createdAt": now - timedelta(seconds=3600)},
        ])
        rows = S.stale_contacts(db, "c1", ("dialing",), cutoff)
        ids = {r["contact_id"] for r in rows}
        self.assertNotIn("ct-nolast-fresh", ids)
        self.assertIn("ct-nolast-old", ids)


class TestFix1HealLive(unittest.TestCase):
    def test_answered_call_never_failed(self):
        import worker as W
        db = FakeMongoClient()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        db.calls.docs.append({
            "_id": "call-live", "campaignId": "c1", "contactId": "ct1",
            "status": "ANSWERED", "createdAt": now - timedelta(seconds=300),
            "metadata": {},
        })
        db.campaign_contacts.docs.append({
            "_id": "cc1", "campaignId": "c1", "contactId": "ct1",
            "callStatus": "dialing", "attemptCount": 1,
            "lastAttemptAt": now - timedelta(seconds=300),
            "updatedAt": now - timedelta(seconds=300),
        })
        db.campaigns.docs.append({"_id": "c1", "status": "running"})
        ctx = make_ctx(db)
        row = {"campaign_id": "c1", "contact_id": "ct1", "call_status": "dialing",
               "attempt_count": 1,
               "last_attempt_at": (now - timedelta(seconds=300)).isoformat()}
        # Must accept `now` (or at least not fail a 5-min-old answered call).
        try:
            healed = W._heal_stale_active(ctx, "c1", row, now)
        except TypeError:
            healed = W._heal_stale_active(ctx, "c1", row)
        call = db.calls.find_one({"_id": "call-live"})
        contact = db.campaign_contacts.find_one({"contactId": "ct1"})
        self.assertNotEqual(str(call.get("status", "")).lower(), "failed",
                            "answered call must never be failed by heal")
        self.assertNotEqual(contact.get("callStatus"), "failed")

    def test_five_minute_call_survives_sweep(self):
        import worker as W
        db = FakeMongoClient()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        dial_at = now - timedelta(seconds=300)  # 5-minute call
        db.campaign_contacts.docs.append({
            "_id": "cc1", "campaignId": "c1", "contactId": "ct1",
            "callStatus": "dialing", "attemptCount": 1,
            "lastAttemptAt": dial_at, "updatedAt": dial_at,
        })
        db.calls.docs.append({
            "_id": "call-1", "campaignId": "c1", "contactId": "ct1",
            "status": "ANSWERED", "createdAt": dial_at, "metadata": {},
        })
        db.campaigns.docs.append({"_id": "c1", "status": "running"})
        ctx = make_ctx(db)
        # Sweep with stale window 900s: 5-min-old dial must not heal/fail.
        stats = W.sweep_campaign(ctx, "c1", now)
        self.assertEqual(stats.get("failed_stale", 0), 0)
        contact = db.campaign_contacts.find_one({"contactId": "ct1"})
        self.assertIn(contact.get("callStatus"), ("dialing", "ringing", "answered", "calling"))

    def test_sweep_failure_tags_reason(self):
        import worker as W
        db = FakeMongoClient()
        now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
        old = now - timedelta(seconds=3600)
        db.campaign_contacts.docs.append({
            "_id": "cc1", "campaignId": "c1", "contactId": "ct1",
            "callStatus": "dialing", "attemptCount": 1,
            "lastAttemptAt": old, "updatedAt": old,
        })
        db.calls.docs.append({
            "_id": "call-dead", "campaignId": "c1", "contactId": "ct1",
            "status": "DIALING", "createdAt": old, "metadata": {"livekit_room": "r"},
        })
        db.campaigns.docs.append({"_id": "c1", "status": "running"})
        ctx = make_ctx(db)
        row = {"campaign_id": "c1", "contact_id": "ct1", "call_status": "dialing",
               "attempt_count": 1, "last_attempt_at": old.isoformat()}
        try:
            W._heal_stale_active(ctx, "c1", row, now)
        except TypeError:
            W._heal_stale_active(ctx, "c1", row)
        call = db.calls.find_one({"_id": "call-dead"})
        meta = call.get("metadata") or {}
        self.assertEqual(meta.get("fail_reason"), "stale_sweep",
                         "sweep failure must tag reason for webhook recovery")


if __name__ == "__main__":
    unittest.main()
