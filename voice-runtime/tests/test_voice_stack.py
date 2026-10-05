# -*- coding: utf-8 -*-
"""Unit tests for the consolidated Sigulon Voice Stack."""

import unittest
from voice_stack import (
    LLM_MODEL,
    STT_MODEL,
    SUPPORTED_LLM_PROVIDER,
    SUPPORTED_STT_PROVIDER,
    SUPPORTED_TTS_PROVIDER,
    TTS_MODEL,
    build_tts,
    clamp_voice_speed,
)


class TestVoiceStackConstants(unittest.TestCase):
    def test_target_models(self):
        self.assertEqual(LLM_MODEL, "google/gemini-2.5-flash")
        self.assertEqual(STT_MODEL, "deepgram/nova-3")
        self.assertEqual(TTS_MODEL, "sonic-3.6")

    def test_target_providers(self):
        self.assertEqual(SUPPORTED_LLM_PROVIDER, "livekit-inference")
        self.assertEqual(SUPPORTED_STT_PROVIDER, "livekit-inference")
        self.assertEqual(SUPPORTED_TTS_PROVIDER, "cartesia")


class TestSpeedClamping(unittest.TestCase):
    def test_clamping_bounds(self):
        self.assertEqual(clamp_voice_speed(0.3), 0.6)
        self.assertEqual(clamp_voice_speed(1.0), 1.0)
        self.assertEqual(clamp_voice_speed(1.2), 1.2)
        self.assertEqual(clamp_voice_speed(2.0), 1.5)
        self.assertEqual(clamp_voice_speed("invalid"), 1.0)


class TestVoiceValidation(unittest.TestCase):
    def test_build_tts_requires_voice_uuid(self):
        with self.assertRaises(ValueError):
            build_tts(voice_id="", language="te")

        with self.assertRaises(ValueError):
            build_tts(voice_id="   ", language="te")


if __name__ == "__main__":
    unittest.main()
