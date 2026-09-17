# -*- coding: utf-8 -*-
"""Comprehensive tests for Cartesia speech configuration and template resolution."""

import os
import unittest
from unittest.mock import AsyncMock, patch

from config import AgentConfig, acquire_concurrency_slot, release_concurrency_slot, resolve_introduction
from language import (
    CARTESIA_STT_ENGLISH_MODEL,
    CARTESIA_STT_MULTILINGUAL_MODEL,
    CARTESIA_TTS_DEFAULT_MODEL,
    CartesiaLanguageConfigurationError,
    resolve_cartesia_language,
    resolve_cartesia_stt_language,
    resolve_cartesia_tts_language,
    validate_cartesia_speech_config,
)


class TestCartesiaLanguageResolution(unittest.TestCase):
    def test_stt_language_and_model_resolution(self):
        # Telugu
        lang, model = resolve_cartesia_stt_language("te-IN")
        self.assertEqual(lang, "te")
        self.assertEqual(model, "ink-whisper")

        # Hindi
        lang, model = resolve_cartesia_stt_language("hi-IN")
        self.assertEqual(lang, "hi")
        self.assertEqual(model, "ink-whisper")

        # Tamil
        lang, model = resolve_cartesia_stt_language("ta-IN")
        self.assertEqual(lang, "ta")
        self.assertEqual(model, "ink-whisper")

        # English
        lang, model = resolve_cartesia_stt_language("en-IN")
        self.assertEqual(lang, "en")
        self.assertEqual(model, "ink-2")

    def test_stt_rejects_ink2_for_non_english(self):
        with self.assertRaises(CartesiaLanguageConfigurationError):
            resolve_cartesia_stt_language("te-IN", model="ink-2")

    def test_tts_language_and_sunset_model_normalization(self):
        # Telugu with sunsetted model 'sonic'
        lang, model = resolve_cartesia_tts_language("te-IN", model="sonic")
        self.assertEqual(lang, "te")
        self.assertEqual(model, "sonic-3")

        # Hindi with sonic-3.5
        lang, model = resolve_cartesia_tts_language("hi-IN", model="sonic-3.5")
        self.assertEqual(lang, "hi")
        self.assertEqual(model, "sonic-3.5")

        # Tamil with default model
        lang, model = resolve_cartesia_tts_language("ta-IN")
        self.assertEqual(lang, "ta")
        self.assertEqual(model, "sonic-3")

        # English
        lang, model = resolve_cartesia_tts_language("en-IN")
        self.assertEqual(lang, "en")
        self.assertEqual(model, "sonic-3")

    def test_validate_cartesia_speech_config(self):
        cfg = validate_cartesia_speech_config(language="te-IN", stt_model=None, tts_model="sonic")
        self.assertEqual(cfg.stt_language, "te")
        self.assertEqual(cfg.stt_model, "ink-whisper")
        self.assertEqual(cfg.tts_language, "te")
        self.assertEqual(cfg.tts_model, "sonic-3")


class TestIntroductionResolution(unittest.TestCase):
    def test_telugu_template_with_lead_name(self):
        raw = "నమస్తే అండి, {{lead_name}} గారితో మాట్లాడుతున్నానా?"
        res = resolve_introduction(raw, lead_name="రాజేష్", language="te-IN")
        self.assertEqual(res, "నమస్తే అండి, రాజేష్ గారితో మాట్లాడుతున్నానా?")
        self.assertNotIn("{", res)
        self.assertNotIn("}", res)

    def test_telugu_template_without_lead_name(self):
        raw = "నమస్తే అండి, {{lead_name}} గారితో మాట్లాడుతున్నానా?"
        res = resolve_introduction(raw, lead_name=None, language="te-IN")
        self.assertEqual(res, "నమస్తే అండి!")
        self.assertNotIn("{", res)
        self.assertNotIn("}", res)

    def test_hindi_template_with_lead_name(self):
        raw = "नमस्ते, क्या मैं {{lead_name}} जी से बात कर रहा/रही हूँ?"
        res = resolve_introduction(raw, lead_name="अमित", language="hi-IN")
        self.assertEqual(res, "नमस्ते, क्या मैं अमित जी से बात कर रहा/रही हूँ?")
        self.assertNotIn("{", res)
        self.assertNotIn("}", res)

    def test_hindi_template_without_lead_name(self):
        raw = "नमस्ते, क्या मैं {{lead_name}} जी से बात कर रहा/रही हूँ?"
        res = resolve_introduction(raw, lead_name=None, language="hi-IN")
        self.assertEqual(res, "नमस्ते!")
        self.assertNotIn("{", res)
        self.assertNotIn("}", res)

    def test_tamil_template_with_and_without_lead_name(self):
        raw = "வணக்கம், நான் {{lead_name}} அவர்களுடன் பேசுகிறேனா?"
        res_with = resolve_introduction(raw, lead_name="கார்த்திக்", language="ta-IN")
        self.assertEqual(res_with, "வணக்கம், நான் கார்த்திக் அவர்களுடன் பேசுகிறேனா?")

        res_without = resolve_introduction(raw, lead_name=None, language="ta-IN")
        self.assertEqual(res_without, "வணக்கம்!")
        self.assertNotIn("{", res_without)

    def test_english_template_with_and_without_lead_name(self):
        raw = "Hello, am I speaking with {{lead_name}}?"
        res_with = resolve_introduction(raw, lead_name="Sarah", language="en-IN")
        self.assertEqual(res_with, "Hello, am I speaking with Sarah?")

        res_without = resolve_introduction(raw, lead_name=None, language="en-IN")
        self.assertEqual(res_without, "Hello!")
        self.assertNotIn("{", res_without)

    def test_single_curly_brace_template_cleanup(self):
        raw = "Hello {lead_name}, is this a good time to speak?"
        res = resolve_introduction(raw, lead_name=None, language="en-IN")
        self.assertEqual(res, "Hello, is this a good time to speak?")
        self.assertNotIn("{", res)
        self.assertNotIn("}", res)

    def test_agent_config_model_validator_sanitizes_intro(self):
        cfg = AgentConfig(
            call_id="c_test",
            agent_id="a_test",
            tenant_id="t_test",
            voice_id="v_test",
            language="te-IN",
            introduction="నమస్తే అండి, {{lead_name}} గారితో మాట్లాడుతున్నానా?",
        )
        self.assertEqual(cfg.introduction, "నమస్తే అండి!")
        self.assertNotIn("{", cfg.introduction)


class TestLocalConcurrencySlotFallback(unittest.IsolatedAsyncioTestCase):
    async def test_acquire_and_release_local_fallback(self):
        with patch.dict(os.environ, {"DEV_ALLOW_LOCAL_SLOTS": "true"}), patch(
            "config.get_redis", side_effect=RuntimeError("Redis down")
        ):
            admitted, count = await acquire_concurrency_slot("tenant_local", 2)
            self.assertTrue(admitted)
            self.assertEqual(count, 1)

            admitted, count = await acquire_concurrency_slot("tenant_local", 2)
            self.assertTrue(admitted)
            self.assertEqual(count, 2)

            # Reached limit
            admitted, count = await acquire_concurrency_slot("tenant_local", 2)
            self.assertFalse(admitted)
            self.assertEqual(count, 2)

            # Release
            rem = await release_concurrency_slot("tenant_local")
            self.assertEqual(rem, 1)


if __name__ == "__main__":
    unittest.main()
