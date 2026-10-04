"""Agent worker tests: metadata, tools, language, greeting, caps (no network)."""

from __future__ import annotations

import unittest

from config import parse_job_metadata, session_key_for_room
from tools import TOOL_REGISTRY, build_tools


class TestJobMetadata(unittest.TestCase):
    def test_parse_json_string(self):
        parsed = parse_job_metadata('{"orgId": "o1", "agentId": "a1", "direction": "outbound"}')
        self.assertEqual((parsed["orgId"], parsed["agentId"], parsed["direction"]),
                         ("o1", "a1", "outbound"))

    def test_parse_dict_and_variants(self):
        parsed = parse_job_metadata({"org_id": "o", "agent_id": "a", "call_id": "c1"})
        self.assertEqual(parsed["callId"], "c1")

    def test_parse_garbage_never_raises(self):
        self.assertEqual(parse_job_metadata("not-json"), {})
        self.assertEqual(parse_job_metadata(None), {})

    def test_session_key_maps_room_1to1(self):
        self.assertEqual(session_key_for_room("room-123"), "sigulon:call:room-123:config")


class TestToolRegistry(unittest.TestCase):
    def test_all_expected_tools_registered(self):
        self.assertEqual(
            sorted(TOOL_REGISTRY.keys()),
            ["book_appointment", "check_availability", "create_lead",
             "pricing_lookup", "transfer_call"],
        )

    def test_build_tools_by_capabilities(self):
        tools = build_tools(["check_availability", "pricing_lookup"])
        self.assertEqual(len(tools), 2)

    def test_unknown_tool_warn_skips(self):
        tools = build_tools(["check_availability", "typo_tool"])
        self.assertEqual(len(tools), 1)

    def test_empty_means_mute_but_valid(self):
        self.assertEqual(build_tools([]), [])


class TestGreetingPolicy(unittest.TestCase):
    def test_inbound_greets_outbound_waits(self):
        from config import AgentConfig

        inbound = AgentConfig(
            call_id="c1", agent_id="a", tenant_id="t", voice_id="v-uuid",
            direction="inbound", introduction="Hello!",
        )
        outbound = AgentConfig(
            call_id="c2", agent_id="a", tenant_id="t", voice_id="v-uuid",
            direction="outbound",
        )
        self.assertTrue(inbound.greeting_first)
        # Outbound dial-out must not greet first: agent responds after callee speech.
        self.assertFalse(outbound.greeting_first if hasattr(outbound, "greeting_first") else False
                         or outbound.direction == "outbound")

    def test_max_tokens_cap_documented(self):
        import agent as agent_mod

        src = open(agent_mod.__file__, encoding="utf-8").read()
        self.assertIn("max_response_tokens=120", src)
        self.assertIn("at most 2 short sentences", src)


class TestLanguageMapping(unittest.TestCase):
    def test_hinglish_stt_multi(self):
        from language import resolve_deepgram_language

        self.assertEqual(resolve_deepgram_language("hinglish"), "multi")


if __name__ == "__main__":
    unittest.main()
