# -*- coding: utf-8 -*-
"""Language stack tests: Cartesia TTS boundary + Deepgram STT via LiveKit."""

import unittest

from config import AgentConfig, resolve_introduction
from language import (
    language_prompt_hint,
    resolve_cartesia_language,
    resolve_cartesia_stt_language,
    resolve_cartesia_tts_language,
    resolve_deepgram_language,
    validate_cartesia_speech_config,
)


class TestDeepgramLanguageMapping(unittest.TestCase):
    def test_indian_languages(self):
        self.assertEqual(resolve_deepgram_language("hi-IN"), "hi")
        self.assertEqual(resolve_deepgram_language("te"), "te")
        self.assertEqual(resolve_deepgram_language("ta-IN"), "ta")
        self.assertEqual(resolve_deepgram_language("en-IN"), "en")

    def test_hinglish_maps_to_multi(self):
        self.assertEqual(resolve_deepgram_language("hinglish"), "multi")
        self.assertEqual(resolve_deepgram_language("HINGLISH"), "multi")
        self.assertIn("Hinglish", language_prompt_hint("hinglish"))

    def test_unknown_falls_back_to_multi(self):
        self.assertEqual(resolve_deepgram_language("xx-YY"), "multi")
        self.assertEqual(resolve_deepgram_language(None), "multi")


class TestPromptHints(unittest.TestCase):
    def test_hints_match_language(self):
        self.assertIn("Hindi", language_prompt_hint("hi"))
        self.assertIn("Telugu", language_prompt_hint("te"))
        self.assertIn("English", language_prompt_hint("en"))


class TestCartesiaBoundary(unittest.TestCase):
    def test_tts_still_base_codes(self):
        lang, model = resolve_cartesia_tts_language("te-IN", model="sonic")
        self.assertEqual((lang, model), ("te", "sonic-3"))

    def test_validate_config(self):
        cfg = validate_cartesia_speech_config(language="hi-IN", stt_model=None, tts_model=None)
        self.assertEqual(cfg.tts_language, "hi")


class TestAgentConfigVoice(unittest.TestCase):
    def test_voice_uuid_required(self):
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            AgentConfig(call_id="c", agent_id="a", tenant_id="t", voice_id="")

    def test_outbound_never_greets_first(self):
        cfg = AgentConfig(
            call_id="c", agent_id="a", tenant_id="t", voice_id="v-uuid-1234",
            direction="outbound", language="hinglish",
        )
        self.assertEqual(cfg.stt_provider, "deepgram")
        self.assertEqual(cfg.tts_model, "sonic-3")


if __name__ == "__main__":
    unittest.main()
