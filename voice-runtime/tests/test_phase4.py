"""Phase 4 regression tests (stdlib unittest — no extra test deps).

Run from ``voice-runtime/``::

    uv run python -m unittest discover -s tests -v

Covers: STT factory, LLM/TTS factories, Plivo
answer-XML/telephone helpers, error classification + retry, VoiceSession +
finalize idempotency (fake Redis/MongoDB), observability metrics + ctx
logging, internal-auth gate, AgentConfig round-trip.
"""

from __future__ import annotations

import asyncio
import logging
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch


def _run(coro):
    return asyncio.run(coro)


class FakeRedis:
    """Minimal async stand-in for the Redis calls session.py makes."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def delete(self, key):
        self.store.pop(key, None)
        return 1

    async def exists(self, key):
        return 1 if key in self.store else 0

    async def ping(self):
        return True


class TestSttProviders(unittest.TestCase):
    def test_default_models(self):
        from providers.stt import default_stt_model

        self.assertEqual(default_stt_model("cartesia", "en"), "ink-2")
        self.assertEqual(default_stt_model("cartesia", "hi"), "ink-whisper")

    def test_unknown_provider_fails_fast(self):
        from providers.stt import create_stt_service

        with self.assertRaises(ValueError):
            create_stt_service(
                provider="unsupported_stt", language="te", model=None, api_key="k"
            )
        with self.assertRaises(ValueError):
            create_stt_service(
                provider="nope", language="en", model=None, api_key="k"
            )

    def test_cartesia_constructs(self):
        from providers.stt import create_stt_service

        svc = create_stt_service(
            provider="cartesia", language="en", model=None, api_key="test-key"
        )
        self.assertEqual(type(svc).__name__, "CartesiaSTTService")


class TestCartesiaLanguageMapping(unittest.TestCase):
    def test_sigulon_bcp47_codes_resolve_to_cartesia_values(self):
        from language import resolve_cartesia_language

        self.assertEqual(resolve_cartesia_language("en-IN"), "en")
        self.assertEqual(resolve_cartesia_language("hi-IN"), "hi")
        self.assertEqual(resolve_cartesia_language("ta-IN"), "ta")
        self.assertEqual(resolve_cartesia_language("te-IN"), "te")

    def test_telugu_uses_ink_whisper_and_sonic_three(self):
        from language import validate_cartesia_speech_config
        from providers.stt import create_stt_service
        from providers.tts import create_tts_service

        config = validate_cartesia_speech_config(
            language="te-IN", stt_model=None, tts_model="sonic-3"
        )
        self.assertEqual(config.stt_language, "te")
        self.assertEqual(config.tts_language, "te")
        stt = create_stt_service(
            provider="cartesia", language="te-IN", model=None, api_key="test-key"
        )
        tts = create_tts_service(
            provider="cartesia", model="sonic-3", voice_id="voice-1",
            language="te-IN", speed=1.0, api_key="test-key",
        )
        self.assertEqual(stt._settings.language, "te")
        self.assertEqual(tts._settings.language, "te")

    def test_unsupported_pair_fails_before_provider_connection(self):
        from language import CartesiaLanguageConfigurationError, validate_cartesia_speech_config

        with self.assertRaises(CartesiaLanguageConfigurationError):
            validate_cartesia_speech_config(
                language="te-IN", stt_model="ink-2", tts_model="sonic-3"
            )
        with self.assertRaises(CartesiaLanguageConfigurationError):
            validate_cartesia_speech_config(
                language="te-IN", stt_model="ink-whisper", tts_model="sonic-2"
            )


class TestLlmTtsFactories(unittest.TestCase):
    def test_llm_unknown_fails(self):
        from providers.llm import create_llm_service

        with self.assertRaises(ValueError):
            create_llm_service(
                provider="unknown_vendor", model="m",
                system_prompt="hi", api_key="k",
            )

    def test_llm_constructs(self):
        from providers.llm import create_llm_service

        svc = create_llm_service(
            provider="openrouter", model="google/gemini-2.5-flash",
            system_prompt="hi", api_key="k",
        )
        self.assertEqual(type(svc).__name__, "OpenAILLMService")

    def test_tts_unknown_fails(self):
        from providers.tts import create_tts_service

        with self.assertRaises(ValueError):
            create_tts_service(
                provider="elevenlabs", model="m", voice_id="v",
                language="en", speed=1.0, api_key="k",
            )

    def test_tts_speed_clamped(self):
        from providers.tts import clamp_voice_speed

        self.assertEqual(clamp_voice_speed(99), 1.5)
        self.assertEqual(clamp_voice_speed(0.1), 0.6)
        self.assertEqual(clamp_voice_speed(1.2), 1.2)
        self.assertEqual(clamp_voice_speed("junk"), 1.0)


class TestTelephony(unittest.TestCase):
    def test_answer_xml_shape(self):
        from providers.telephony import build_answer_xml

        xml = build_answer_xml(
            stream_url="wss://rt.example.com/voice-runtime/abc",
            status_callback_url="https://rt.example.com/plivo/status-callback",
        )
        self.assertIn("<Stream", xml)
        self.assertIn('bidirectional="true"', xml)
        self.assertIn("wss://rt.example.com/voice-runtime/abc", xml)
        self.assertIn("statusCallbackUrl=", xml)

    def test_answer_xml_escapes(self):
        from providers.telephony import build_answer_xml

        xml = build_answer_xml(stream_url='wss://x/?a="b"&c=<d>')
        self.assertNotIn('"b"', xml)
        self.assertIn("&quot;", xml)

    def test_stream_url_scheme(self):
        from providers.telephony import stream_url_for_call

        self.assertEqual(
            stream_url_for_call(
                runtime_base_url="https://rt.example.com", call_id="abc"
            ),
            "wss://rt.example.com/voice-runtime/abc",
        )
        self.assertEqual(
            stream_url_for_call(
                runtime_base_url="http://localhost:8000", call_id="a/b"
            ),
            "ws://localhost:8000/voice-runtime/a%2Fb",
        )


class TestErrors(unittest.TestCase):
    def test_classify(self):
        from providers.errors import classify_provider_error

        self.assertEqual(
            classify_provider_error(
                RuntimeError("connect timeout"), "openrouter"
            ).category,
            "transient",
        )
        self.assertEqual(
            classify_provider_error(
                RuntimeError("invalid api key"), "openrouter"
            ).category,
            "permanent",
        )
        self.assertEqual(
            classify_provider_error(RuntimeError("HTTP 503"), "plivo").category,
            "transient",
        )

    def test_retry_then_success(self):
        from providers.errors import with_provider_retry

        calls = {"n": 0}

        async def flaky():
            calls["n"] += 1
            if calls["n"] < 3:
                raise ConnectionError("connection reset by peer")
            return "ok"

        async def go():
            return await with_provider_retry(
                flaky, provider="plivo", operation="test",
                base_delay_seconds=0.001,
            )

        self.assertEqual(_run(go()), "ok")
        self.assertEqual(calls["n"], 3)

    def test_permanent_no_retry(self):
        from providers.errors import ProviderError, with_provider_retry

        calls = {"n": 0}

        async def bad():
            calls["n"] += 1
            raise RuntimeError("unauthorized: bad key")

        async def go():
            return await with_provider_retry(
                bad, provider="plivo", operation="test",
                base_delay_seconds=0.001,
            )

        with self.assertRaises(ProviderError):
            _run(go())
        self.assertEqual(calls["n"], 1)


class TestSession(unittest.TestCase):
    def test_terminal_status_mapping(self):
        from session import _terminal_status_for

        self.assertEqual(_terminal_status_for("completed"), "completed")
        self.assertEqual(_terminal_status_for("timeout"), "completed")
        self.assertEqual(_terminal_status_for("busy"), "busy")
        self.assertEqual(_terminal_status_for("no_answer"), "no_answer")
        self.assertEqual(_terminal_status_for("cancelled"), "cancelled")
        self.assertEqual(_terminal_status_for("rejected_concurrency"), "failed")
        self.assertEqual(_terminal_status_for("setup_failed: x"), "failed")
        self.assertEqual(_terminal_status_for("error: boom"), "failed")

    def test_crud_and_finalize_idempotent(self):
        import session as S

        fake = FakeRedis()
        mongo_writes = {"updates": [], "events": []}

        class FakeCollection:
            def __init__(self, name):
                self.name = name

            def find_one(self, *_a, **_k):
                if self.name == "calls":
                    return {"_id": "c1", "organizationId": "o1", "agentId": "a1"}
                return None

            def update_one(self, _filter, update, **_kwargs):
                mongo_writes["updates"].append(update["$set"])
                return MagicMock(upserted_id=None)

            def insert_one(self, document):
                mongo_writes["events"].append(document)

        class FakeMongo:
            calls = FakeCollection("calls")
            call_events = FakeCollection("call_events")
            recordings = FakeCollection("recordings")
            transcripts = FakeCollection("transcripts")

        fake_client = FakeMongo()

        async def go():
            with patch.object(S, "_redis", return_value=fake), patch.object(
                S, "_mongo_database", return_value=fake_client
            ), patch("config.release_concurrency_slot", new=AsyncMock()) as rel:
                created = await S.create_session(
                    S.VoiceSession(
                        session_id="c1", call_id="c1", org_id="o1",
                        agent_id="a1", stt_provider="cartesia",
                    )
                )
                self.assertEqual(created.status, "created")
                hb = await S.heartbeat("c1", status="active")
                assert hb is not None
                self.assertEqual(hb.status, "active")
                self.assertTrue(await S.finalize_call(
                    call_id="c1", outcome="completed", duration_seconds=42,
                ))
                # Second finalize is a no-op (idempotent).
                self.assertFalse(await S.finalize_call(
                    call_id="c1", outcome="completed", duration_seconds=42,
                ))
                self.assertIsNone(await S.get_session("c1"))
                return rel

        rel = _run(go())
        rel.assert_awaited_once()
        self.assertEqual(len(mongo_writes["updates"]), 1)
        self.assertEqual(mongo_writes["updates"][0]["status"], "COMPLETED")
        self.assertEqual(mongo_writes["updates"][0]["durationSeconds"], 42)
        self.assertEqual(len(mongo_writes["events"]), 1)
        self.assertEqual(
            mongo_writes["events"][0]["idempotencyKey"], "finalized:c1"
        )


class TestObservability(unittest.TestCase):
    def test_metrics_render(self):
        import observability as O

        O.inc("calls_started_total", 2)
        snap = O.snapshot()
        self.assertGreaterEqual(snap.get("calls_started_total", 0), 2)
        text = O.render_prometheus()
        self.assertIn("sigulon_runtime_calls_started_total", text)
        self.assertIn("sigulon_runtime_uptime_seconds", text)

    def test_ctx_logging(self):
        import observability as O

        O.bind_call_context(call_id="c9", tenant_id="o9", agent_id="a9")
        try:
            record = logging.LogRecord(
                name="t", level=logging.INFO, pathname=__file__, lineno=1,
                msg="hello", args=(), exc_info=None,
            )
            out = O.JsonFormatter().format(record)
            self.assertIn('"call_id": "c9"', out)
            self.assertIn('"tenant_id": "o9"', out)
        finally:
            O.clear_call_context()


class TestInternalAuth(unittest.TestCase):
    def test_missing_secret_fails_closed(self):
        from fastapi import HTTPException

        from auth import require_internal_secret

        async def go():
            with patch.dict(os.environ, {}, clear=False):
                with patch("auth.internal_secret", return_value=""):
                    with self.assertRaises(HTTPException) as ctx:
                        await require_internal_secret("Bearer x")
                    self.assertEqual(ctx.exception.status_code, 503)

        _run(go())

    def test_bad_token_rejected(self):
        from fastapi import HTTPException

        from auth import require_internal_secret

        async def go():
            with patch("auth.internal_secret", return_value="s3cret"):
                with self.assertRaises(HTTPException) as ctx:
                    await require_internal_secret("Bearer wrong")
                self.assertEqual(ctx.exception.status_code, 401)
                await require_internal_secret("Bearer s3cret")  # no raise

        _run(go())

    def test_runtime_stream_token_is_bound_to_call_and_expiry(self):
        import base64
        import hashlib
        import hmac

        from auth import verify_runtime_stream_token

        secret = "test-stream-signing-secret"
        expires_at = 2_000_000_000
        call_id = "call-a"
        signature = hmac.new(
            secret.encode("utf-8"),
            f"v1.{call_id}.{expires_at}".encode("utf-8"),
            hashlib.sha256,
        ).digest()
        token = "v1.%s.%s" % (
            expires_at,
            base64.urlsafe_b64encode(signature).decode("ascii").rstrip("="),
        )
        with patch.dict(os.environ, {"INTERNAL_API_SECRET": secret}), patch(
            "auth.time.time", return_value=1_900_000_000
        ):
            self.assertTrue(verify_runtime_stream_token(call_id, token))
            self.assertFalse(verify_runtime_stream_token("call-b", token))


class TestAgentConfigRoundtrip(unittest.TestCase):
    def test_legacy_stack_normalizes_to_required_providers(self):
        from config import AgentConfig, default_openrouter_model

        cfg = AgentConfig(
            call_id="c1", agent_id="a1", tenant_id="o1",
            llm_provider="legacy_provider", llm_model="legacy-model",
            stt_provider="legacy_provider", tts_provider="legacy_provider",
            tts_model="legacy-model", language="te", voice_id="v1",
        )
        canon = cfg.to_canonical()
        self.assertEqual(canon["intelligence"]["provider"], "openrouter")
        self.assertEqual(canon["intelligence"]["model"], default_openrouter_model())
        self.assertEqual(canon["speech"]["stt_provider"], "cartesia")
        self.assertEqual(canon["speech"]["tts_provider"], "cartesia")
        self.assertEqual(canon["speech"]["tts_model"], "sonic-3")
        back = AgentConfig.from_canonical(canon)
        self.assertEqual(back.stt_provider, "cartesia")
        self.assertEqual(back.language, "te")


if __name__ == "__main__":
    unittest.main()
