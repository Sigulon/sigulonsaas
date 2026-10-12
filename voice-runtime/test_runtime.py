"""Offline regression checks: python -m unittest test_runtime -v."""
import unittest
from unittest.mock import AsyncMock, patch

from bundle_runner import BundleRunner
from config import AgentConfig, ConfigIdentityMismatchError, load_agent_config_for_job


def bundle():
    return {"first_response": "Hello {{lead_name}}", "sections": [
        {"section_key": "start", "order": 1, "prompt": "Welcome {{lead_name}}", "edges": [
            {"to_key": "faqs", "condition": "If caller asks a question"},
            {"to_key": "close", "condition": "If not interested"},
            {"to_key": "next", "condition": "If interested"},
        ]},
        {"section_key": "next", "order": 2, "prompt": "Next step"},
        {"section_key": "close", "order": 3, "prompt": "Goodbye"},
        {"section_key": "faqs", "order": 4, "prompt": "Verified facts"},
    ]}


class BundleTests(unittest.TestCase):
    def test_nested_context_and_runtime_instructions_survive_transition(self):
        runner = BundleRunner(bundle(), {"customerContext": {"lead_name": "Alex"}},
                              runtime_instructions="System, injection, context, language")
        self.assertEqual(runner.resolve_greeting(), "Hello Alex")
        self.assertIn("Welcome Alex", runner.get_current_instructions())
        runner.transition("start", "next")
        self.assertIn("System, injection, context, language", runner.get_current_instructions())
        self.assertIn("Next step", runner.get_current_instructions())

    def test_conditions_are_exposed_without_keyword_guessing(self):
        data = bundle()
        data["sections"][0]["edges"][2]["condition"] = "Once details captured"
        runner = BundleRunner(data)
        self.assertIn("Once details captured", runner.get_current_instructions())
        runner.transition("start", "next")
        self.assertEqual(runner.current_section["section_key"], "next")

    def test_unknown_and_disabled_routes_stay_put(self):
        runner = BundleRunner(bundle())
        for target in ("faqs", "missing"):
            with self.assertRaises(ValueError):
                runner.transition("start", target)
            self.assertEqual(runner.current_section["section_key"], "start")
        data = bundle()
        data["sections"][1]["enabled"] = False
        with self.assertRaises(ValueError):
            BundleRunner(data).transition("start", "next")

    def test_stale_and_terminal_transitions_rejected(self):
        runner = BundleRunner(bundle())
        runner.transition("start", "close")
        for source in ("start", "close"):
            with self.assertRaises(ValueError):
                runner.transition(source, "next")


class ToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_final_turn_updates_before_hook_returns(self):
        with patch("dotenv.load_dotenv"):
            from agent import create_runtime_agent
        from livekit.agents import llm
        data = bundle()
        data["variables"] = [{"key": "budget", "source": "capture"}]
        data["sections"][0]["prompt"] = "Budget: {{budget}}"
        runner = BundleRunner(data, runtime_instructions="Persistent runtime rules")
        agent = create_runtime_agent(runner.get_current_instructions(), [], runner)
        await agent.on_user_turn_completed(llm.ChatContext(), llm.ChatMessage(role="user", content=["My budget is 30 lakh"]))
        self.assertIn("Budget: 30 lakh", agent.instructions)
        self.assertIn("Persistent runtime rules", agent.instructions)
        self.assertEqual(runner.current_section["section_key"], "start")

    async def test_tool_awaits_instructions_and_rejects_invalid_target(self):
        from livekit.agents import ToolError
        runner = BundleRunner(bundle())
        update = AsyncMock()
        tool = runner.create_transition_tool(update)
        await tool("start", "next")
        update.assert_awaited_once()
        with self.assertRaises(ToolError):
            await tool("start", "close")

    async def test_update_failure_rolls_back_state(self):
        runner = BundleRunner(bundle())
        tool = runner.create_transition_tool(AsyncMock(side_effect=RuntimeError("failed")))
        with self.assertRaises(RuntimeError):
            await tool("start", "next")
        self.assertEqual(runner.current_section["section_key"], "start")


class ConfigTests(unittest.IsolatedAsyncioTestCase):
    async def test_mismatched_call_config_never_falls_back_or_mutates_cache(self):
        for tenant, agent in [("other", "agent"), ("org", "other")]:
            cfg = AgentConfig(call_id="call", tenant_id=tenant, agent_id=agent, voice_id="voice")
            with patch("config.load_agent_config", AsyncMock(return_value=cfg)), \
                 patch("config.load_agent_config_by_org_agent", AsyncMock()) as fallback:
                with self.assertRaises(ConfigIdentityMismatchError):
                    await load_agent_config_for_job({"orgId": "org", "agentId": "agent", "callId": "call",
                                                     "promptInjection": "should not be applied"})
                fallback.assert_not_awaited()
                self.assertIsNone(cfg.prompt_injection)

    async def test_fallback_identity_also_checked(self):
        cfg = AgentConfig(call_id="call", tenant_id="other", agent_id="agent", voice_id="voice")
        with patch("config.load_agent_config_by_org_agent", AsyncMock(return_value=cfg)):
            with self.assertRaises(ConfigIdentityMismatchError):
                await load_agent_config_for_job({"orgId": "org", "agentId": "agent"})


class AdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_unavailable_concurrency_fails_closed(self):
        with patch("dotenv.load_dotenv"):
            import agent
        cfg = AgentConfig(call_id="call", tenant_id="org", agent_id="agent", voice_id="voice")
        with patch.object(agent, "notify_credits_reserve", AsyncMock(return_value=True)), \
             patch.object(agent, "acquire_concurrency_slot", AsyncMock(side_effect=RuntimeError("unavailable"))), \
             patch.object(agent, "notify_credits_settle", AsyncMock()) as settle, \
             patch.object(agent, "_run_admitted_session", AsyncMock()) as run:
            with self.assertRaises(RuntimeError):
                await agent._run_session(None, cfg, {})
            run.assert_not_awaited()
            settle.assert_awaited_once_with("call", 0)

    async def test_denials_never_start_audio(self):
        # Prevent local .env access; all service operations are mocked.
        with patch("dotenv.load_dotenv"):
            import agent
        cfg = AgentConfig(call_id="call", tenant_id="org", agent_id="agent", voice_id="voice")
        for reserved, slot in [(False, (True, 1)), (True, (False, 1))]:
            with patch.object(agent, "notify_credits_reserve", AsyncMock(return_value=reserved)), \
                 patch.object(agent, "acquire_concurrency_slot", AsyncMock(return_value=slot)) as acquire, \
                 patch.object(agent, "notify_credits_settle", AsyncMock()) as settle, \
                 patch.object(agent, "_run_admitted_session", AsyncMock()) as run:
                await agent._run_session(None, cfg, {})
                run.assert_not_awaited()
                if not reserved:
                    acquire.assert_not_awaited()
                    settle.assert_not_awaited()
                else:
                    settle.assert_awaited_once_with("call", 0)

    async def test_setup_failure_releases_reservation_and_slot(self):
        with patch("dotenv.load_dotenv"):
            import agent
        cfg = AgentConfig(call_id="call", tenant_id="org", agent_id="agent", voice_id="voice")
        with patch.object(agent, "notify_credits_reserve", AsyncMock(return_value=True)), \
             patch.object(agent, "acquire_concurrency_slot", AsyncMock(return_value=(True, 1))), \
             patch.object(agent, "release_concurrency_slot", AsyncMock()) as release, \
             patch.object(agent, "notify_credits_settle", AsyncMock()) as settle, \
             patch.object(agent, "_run_admitted_session", AsyncMock(side_effect=RuntimeError("setup"))):
            with self.assertRaises(RuntimeError):
                await agent._run_session(None, cfg, {})
            release.assert_awaited_once_with("org", "call")
            settle.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
