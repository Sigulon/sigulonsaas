"""Post-call extraction tests (pure — no network, no services)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from postcall import (
    OUTCOMES,
    parse_summary_response,
    summary_prompt,
    transcript_from_context,
)


def _msg(role, content):
    return SimpleNamespace(role=role, content=content)


class TestTranscriptCapture(unittest.TestCase):
    def test_maps_roles_and_skips_system_and_empty(self):
        ctx = SimpleNamespace(get_messages=lambda: [
            _msg("system", "Be nice"),
            _msg("user", "Hi, do you do implants?"),
            _msg("assistant", "Yes! Want to book?"),
            _msg("user", "   "),
        ])
        self.assertEqual(transcript_from_context(ctx), [
            {"role": "user", "text": "Hi, do you do implants?"},
            {"role": "agent", "text": "Yes! Want to book?"},
        ])

    def test_none_and_broken_context(self):
        self.assertEqual(transcript_from_context(None), [])
        broken = SimpleNamespace(get_messages=lambda: (_ for _ in ()).throw(RuntimeError("x")))
        self.assertEqual(transcript_from_context(broken), [])

    def test_multimodal_parts(self):
        ctx = SimpleNamespace(get_messages=lambda: [
            _msg("user", [{"text": "hello"}, {"inline_data": "abc"}]),
        ])
        turns = transcript_from_context(ctx)
        self.assertEqual(len(turns), 1)
        self.assertIn("hello", turns[0]["text"])


class TestSummaryParsing(unittest.TestCase):
    def test_clean_json(self):
        out = parse_summary_response(
            '{"summary": "Caller asked about implants.", "outcome": "interested"}'
        )
        self.assertEqual(out["outcome"], "interested")
        self.assertIn("implants", out["summary"])

    def test_fences_and_case(self):
        out = parse_summary_response(
            '```json\n{"summary": "x", "outcome": "CallBack_Requested"}\n```'
        )
        self.assertEqual(out["outcome"], "callback_requested")

    def test_unknown_outcome_and_garbage(self):
        self.assertEqual(
            parse_summary_response('{"summary": "x", "outcome": "bogus"}')["outcome"],
            "completed",
        )
        self.assertEqual(parse_summary_response("not json")["outcome"], "completed")
        self.assertEqual(parse_summary_response("")["summary"], "")


class TestSummaryPrompt(unittest.TestCase):
    def test_lists_outcomes_and_turns(self):
        prompt = summary_prompt([{"role": "user", "text": "hi"}])
        for outcome in OUTCOMES:
            self.assertIn(outcome, prompt)
        self.assertIn("user: hi", prompt)


if __name__ == "__main__":
    unittest.main()
