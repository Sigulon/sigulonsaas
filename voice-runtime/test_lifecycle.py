"""SDK-backed tests with no network, provider credentials, or dotenv reads."""
import asyncio
import time
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from livekit.agents import llm
from livekit.agents.voice.events import ConversationItemAddedEvent, UserInputTranscribedEvent
from livekit.rtc import EventEmitter

from config import AgentConfig
from lifecycle import CallLifecycle, SessionEnd, attach_transcripts


class SpeechTests(unittest.TestCase):
    def test_cartesia_sdk_options_and_language_mapping(self):
        from livekit.plugins import cartesia
        from voice_stack import build_tts
        for language, expected in [("te-IN", "te"), ("hi-IN", "hi"),
                                   ("ta_IN", "ta"), ("en-IN", "en"),
                                   ("hinglish", "hi"), ("en-hi", "hi")]:
            with self.subTest(language=language), patch.object(cartesia, "TTS", autospec=True) as tts:
                build_tts(voice_id="explicit-voice", language=language, speed=9)
                tts.assert_called_once_with(model="sonic-3.6", voice="explicit-voice",
                                            language=expected, speed=1.5,
                                            word_timestamps=expected == "en")

    def test_bad_language_or_model_never_constructs_provider(self):
        from voice_stack import build_tts
        with patch("livekit.plugins.cartesia.TTS") as tts:
            for opts in [{"language": "unknown"}, {"model": "other"}, {"voice_id": ""}]:
                with self.assertRaises(ValueError):
                    build_tts(**{"voice_id": "explicit", **opts})
            tts.assert_not_called()

    def test_committed_turns_no_duplicates_or_global_text_dedup(self):
        session = EventEmitter()
        events, tracker = [], Mock()
        attach_transcripts(session, events, tracker)
        session.emit("user_input_transcribed", UserInputTranscribedEvent(transcript="ye", is_final=False))
        session.emit("user_input_transcribed", UserInputTranscribedEvent(transcript="yes", is_final=True))
        messages = [llm.ChatMessage(role="user", content=["yes"]),
                    llm.ChatMessage(role="assistant", content=["Hello"], interrupted=True),
                    llm.ChatMessage(role="user", content=["yes"]),
                    llm.ChatMessage(role="system", content=["private instructions"])]
        for message in messages:
            ev = ConversationItemAddedEvent(item=message)
            session.emit("conversation_item_added", ev)
            session.emit("conversation_item_added", ev)
        self.assertEqual(events, [{"role": "user", "text": "yes"},
                                  {"role": "agent", "text": "Hello"},
                                  {"role": "user", "text": "yes"}])
        tracker.mark_stt_final.assert_called_once()
        tracker.mark_tts_audio.assert_not_called()


def context():
    room = EventEmitter()
    room.name = "call"
    return SimpleNamespace(room=room, delete_room=AsyncMock(), shutdown=Mock(),
                           add_shutdown_callback=Mock())


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_full_call_tears_down_before_postcall_and_settlement(self):
        with patch("dotenv.load_dotenv"):
            import agent
        for outcome in ("caller", "close", "cap", "error"):
            with self.subTest(outcome=outcome), ExitStack() as stack:
                ctx = context()
                caller = SimpleNamespace(identity="caller")
                ctx.connect = AsyncMock()
                ctx.wait_for_participant = AsyncMock(return_value=caller)
                session = EventEmitter()
                order = []

                async def close():
                    order.append("session_closed")
                    session.emit("conversation_item_added", ConversationItemAddedEvent(
                        item=llm.ChatMessage(role="assistant", content=["Goodbye"])))

                session.aclose = AsyncMock(side_effect=close)

                async def start(**kwargs):
                    self.assertEqual(kwargs["room_options"].participant_identity, "caller")
                    if outcome == "error":
                        raise RuntimeError("startup failure")

                async def greet(**kwargs):
                    if outcome == "caller":
                        ctx.room.emit("participant_disconnected", caller)
                    elif outcome == "close":
                        session.emit("close")
                    else:
                        await asyncio.Event().wait()

                session.start = AsyncMock(side_effect=start)
                session.generate_reply = AsyncMock(side_effect=greet)
                ctx.delete_room.side_effect = lambda: order.append("room_deleted")

                async def post(payload):
                    self.assertEqual(order[:2], ["session_closed", "room_deleted"])
                    self.assertIn("Goodbye", str(payload))
                    order.append("postcall")

                async def settle(*args):
                    self.assertEqual(order[-1], "postcall")
                    order.append("settled")

                for name, value in {
                    "build_stt": Mock(return_value=SimpleNamespace(aclose=AsyncMock())),
                    "build_llm": Mock(return_value=SimpleNamespace(aclose=AsyncMock())),
                    "build_tts": Mock(return_value=SimpleNamespace(aclose=AsyncMock())),
                    "notify_credits_reserve": AsyncMock(return_value=True),
                    "acquire_concurrency_slot": AsyncMock(return_value=(True, 1)),
                    "release_concurrency_slot": AsyncMock(),
                    "notify_credits_settle": AsyncMock(side_effect=settle),
                    "summarize_call": AsyncMock(return_value=None),
                    "post_postcall": AsyncMock(side_effect=post),
                }.items():
                    stack.enter_context(patch.object(agent, name, value))
                stack.enter_context(patch("livekit.agents.AgentSession", return_value=session))
                stack.enter_context(patch("livekit.plugins.silero.VAD.load", return_value=Mock()))
                stack.enter_context(patch("livekit.plugins.turn_detector.multilingual.MultilingualModel", return_value=Mock()))
                cfg = AgentConfig(call_id="call", tenant_id="org", agent_id="agent", voice_id="voice",
                                  introduction="Hello", greeting_first=True, max_call_seconds=1)
                await asyncio.wait_for(agent._run_session(ctx, cfg, {}), 3)
                session.aclose.assert_awaited_once()
                ctx.delete_room.assert_awaited_once()
                self.assertEqual(order, ["session_closed", "room_deleted", "postcall", "settled"])

    async def test_cap_cancels_startup_and_removes_listeners(self):
        ctx, session = context(), EventEmitter()
        end = SessionEnd(ctx, session)
        cancelled = asyncio.Event()

        async def blocked_greeting():
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        with self.assertRaises(asyncio.TimeoutError):
            await end.run(blocked_greeting(), .01)
        self.assertTrue(cancelled.is_set())
        self.assertFalse(any(ctx.room._events.values()))
        self.assertFalse(any(session._events.values()))

    async def test_caller_departure_and_session_close_end_wait(self):
        for event in ("participant_disconnected", "disconnected", "close"):
            ctx, session = context(), EventEmitter()
            end = SessionEnd(ctx, session)
            end.caller_identity = "caller"
            ctx.room.emit("participant_disconnected", SimpleNamespace(identity="observer"))
            self.assertFalse(end.event.is_set())
            if event == "participant_disconnected":
                ctx.room.emit(event, SimpleNamespace(identity="caller"))
            else:
                (session if event == "close" else ctx.room).emit(event)
            await asyncio.wait_for(end.run(asyncio.sleep(60), 60), .5)
            self.assertFalse(any(ctx.room._events.values()))

    async def test_caller_departure_before_wait_for_participant_resumes(self):
        ctx, session = context(), EventEmitter()
        end = SessionEnd(ctx, session)
        ctx.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
        end.bind_caller("caller")
        self.assertTrue(end.event.is_set())
        await asyncio.wait_for(end.run(asyncio.sleep(60), 60), .5)

    async def test_teardown_once_and_room_deletion_even_on_session_failure(self):
        ctx = context()
        lifecycle = CallLifecycle(ctx)
        lifecycle.started = time.monotonic()
        lifecycle.session = SimpleNamespace(aclose=AsyncMock(side_effect=RuntimeError("close")))
        await asyncio.gather(lifecycle.close(), lifecycle.close())
        lifecycle.session.aclose.assert_awaited_once()
        ctx.delete_room.assert_awaited_once()
        self.assertGreaterEqual(lifecycle.duration, 0)

    async def test_cancelled_wait_does_not_cancel_teardown(self):
        ctx = context()
        lifecycle = CallLifecycle(ctx)
        closing = asyncio.Event()
        resume = asyncio.Event()

        async def close():
            closing.set()
            await resume.wait()

        lifecycle.session = SimpleNamespace(aclose=close)
        task = asyncio.create_task(lifecycle.close())
        await closing.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        resume.set()
        await lifecycle.close()
        ctx.delete_room.assert_awaited_once()

    async def test_denial_deletes_room_and_settlement_failure_still_shuts_down(self):
        with patch("dotenv.load_dotenv"):
            import agent
        cfg = AgentConfig(call_id="call", tenant_id="org", agent_id="agent", voice_id="voice")
        ctx = context()
        with patch.object(agent, "notify_credits_reserve", AsyncMock(return_value=True)), \
             patch.object(agent, "acquire_concurrency_slot", AsyncMock(return_value=(False, 1))), \
             patch.object(agent, "notify_credits_settle", AsyncMock(side_effect=RuntimeError("billing"))) as settle, \
             patch.object(agent, "_run_admitted_session", AsyncMock()) as run:
            await agent._run_session(ctx, cfg, {})
        run.assert_not_awaited()
        ctx.delete_room.assert_awaited_once()
        settle.assert_awaited_once_with("call", 0)
        ctx.shutdown.assert_called_once()

    async def test_external_shutdown_releases_and_settles_exactly_once(self):
        with patch("dotenv.load_dotenv"):
            import agent
        cfg = AgentConfig(call_id="call", tenant_id="org", agent_id="agent", voice_id="voice")
        ctx, running = context(), asyncio.Event()

        async def admitted(*args):
            running.set()
            await asyncio.Event().wait()

        with patch.object(agent, "notify_credits_reserve", AsyncMock(return_value=True)), \
             patch.object(agent, "acquire_concurrency_slot", AsyncMock(return_value=(True, 1))), \
             patch.object(agent, "notify_credits_settle", AsyncMock()) as settle, \
             patch.object(agent, "release_concurrency_slot", AsyncMock()) as release, \
             patch.object(agent, "_run_admitted_session", admitted):
            task = asyncio.create_task(agent._run_session(ctx, cfg, {}))
            await running.wait()
            callback = ctx.add_shutdown_callback.call_args.args[0]
            await asyncio.wait_for(callback("worker shutdown"), 1)
            with self.assertRaises(asyncio.CancelledError):
                await task
            await callback("again")
        release.assert_awaited_once_with("org", "call")
        settle.assert_awaited_once()
        ctx.delete_room.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
