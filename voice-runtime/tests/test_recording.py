"""Unit tests for voice-runtime recording module and MongoDB persistence."""

from __future__ import annotations

import io
import unittest
import wave
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame
from recording import (
    AudioTapProcessor,
    CallAudioRecorder,
    GCSRecordingUploader,
    upload_call_recording,
)


class TestCallAudioRecorder(unittest.TestCase):
    def setUp(self) -> None:
        self.recorder = CallAudioRecorder(sample_rate=16000, num_channels=1)

    def test_empty_recording(self) -> None:
        wav_bytes, duration = self.recorder.finalize_recording()
        self.assertEqual(wav_bytes, b"")
        self.assertEqual(duration, 0.0)

    def test_single_track_user_recording(self) -> None:
        # 16000 samples * 2 bytes = 32000 bytes = 1.0 second of audio
        user_pcm = b"\x05\x00" * 16000
        self.recorder.append_audio("user", user_pcm, 16000)

        wav_bytes, duration = self.recorder.finalize_recording()
        self.assertGreater(len(wav_bytes), 32000)
        self.assertAlmostEqual(duration, 1.0, places=1)

        # Verify WAV header
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 1)
            self.assertEqual(wf.getsampwidth(), 2)
            self.assertEqual(wf.getframerate(), 16000)
            self.assertEqual(wf.getnframes(), 16000)

    def test_dual_track_alignment_and_mixing(self) -> None:
        # User speaks for 0.5s (8000 samples = 16000 bytes)
        user_pcm = b"\x01\x00" * 8000
        # Bot speaks for 1.0s (16000 samples = 32000 bytes)
        bot_pcm = b"\x02\x00" * 16000

        self.recorder.append_audio("user", user_pcm, 16000)
        self.recorder.append_audio("bot", bot_pcm, 16000)

        wav_bytes, duration = self.recorder.finalize_recording()
        self.assertAlmostEqual(duration, 1.0, places=1)

        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 1)
            self.assertEqual(wf.getframerate(), 16000)
            self.assertEqual(wf.getnframes(), 16000)

    def test_silence_gap_injection(self) -> None:
        self.recorder.append_audio("user", b"\x01\x00" * 160, 16000)
        # Simulate time jump of 0.5s
        self.recorder._last_user_time -= 0.5
        self.recorder.append_audio("user", b"\x01\x00" * 160, 16000)

        # Buffer should contain injected silence
        self.assertGreater(len(self.recorder.user_audio), 320)


class TestGCSRecordingUploader(unittest.TestCase):
    def setUp(self) -> None:
        self.uploader = GCSRecordingUploader(
            bucket_name="test-bucket",
            signed_url_expiration_secs=3600,
        )

    def test_empty_bytes_fails_safely(self) -> None:
        result = self.uploader.upload_recording_sync(
            org_id="org-123",
            agent_id="agent-456",
            call_id="call-789",
            wav_bytes=b"",
            duration_seconds=0.0,
        )
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["objectPath"], "recordings/org-123/agent-456/call-789.wav")
        self.assertEqual(result["url"], "")

    @patch("recording.GCSRecordingUploader._get_client")
    def test_successful_gcs_upload_and_signed_url(self, mock_get_client: MagicMock) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_blob = MagicMock()

        mock_get_client.return_value = mock_client
        mock_client.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/test-bucket/signed-url"

        test_wav = b"RIFF....WAVEfmt ...."
        result = self.uploader.upload_recording_sync(
            org_id="org-abc",
            agent_id="agent-def",
            call_id="call-ghi",
            wav_bytes=test_wav,
            duration_seconds=5.4,
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["storageProvider"], "gcs")
        self.assertEqual(result["bucket"], "test-bucket")
        self.assertEqual(result["objectPath"], "recordings/org-abc/agent-def/call-ghi.wav")
        self.assertEqual(result["url"], "https://storage.googleapis.com/test-bucket/signed-url")
        self.assertEqual(result["durationSeconds"], 5.4)
        self.assertEqual(result["sizeBytes"], len(test_wav))

        # Verify blob calls
        mock_client.bucket.assert_called_once_with("test-bucket")
        mock_bucket.blob.assert_called_once_with("recordings/org-abc/agent-def/call-ghi.wav")
        mock_blob.upload_from_string.assert_called_once_with(test_wav, content_type="audio/wav")
        mock_blob.generate_signed_url.assert_called_once()

    @patch("recording.GCSRecordingUploader._get_client")
    def test_gcs_upload_failure_falls_back_gracefully(self, mock_get_client: MagicMock) -> None:
        mock_get_client.side_effect = RuntimeError("GCS credentials not found")

        test_wav = b"RIFF....test"
        result = self.uploader.upload_recording_sync(
            org_id="org-fail",
            agent_id="agent-fail",
            call_id="call-fail",
            wav_bytes=test_wav,
            duration_seconds=2.0,
        )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["url"], "")
        self.assertIn("GCS credentials not found", result.get("error", ""))


class TestSessionRecordingPersistence(unittest.IsolatedAsyncioTestCase):
    @patch("session._redis")
    @patch("session._mongo_database")
    async def test_finalize_call_persists_recording(
        self, mock_db_client: MagicMock, mock_redis_func: MagicMock
    ) -> None:
        mock_redis = MagicMock()
        mock_redis.set = AsyncMock(return_value=True)
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.delete = AsyncMock(return_value=True)
        mock_redis_func.return_value = mock_redis

        # Mock the pooled MongoDB database.
        class FakeMongo:
            def __init__(self) -> None:
                self.calls = MagicMock()
                self.recordings = MagicMock()
                self.transcripts = MagicMock()
                self.call_events = MagicMock()

        mock_client = FakeMongo()
        mock_client.calls.find_one.return_value = {
            "_id": "call-1", "organizationId": "org-1", "agentId": "agent-1"
        }
        mock_client.calls.update_one.return_value = MagicMock()
        mock_client.recordings.update_one.return_value = MagicMock(upserted_id=None)
        mock_client.recordings.find_one.return_value = None
        mock_db_client.return_value = mock_client

        from session import finalize_call

        recording_info = {
            "status": "completed",
            "storageProvider": "gcs",
            "bucket": "sigulon-recordings",
            "objectPath": "recordings/org-1/agent-1/call-1.wav",
            "url": "https://storage.googleapis.com/sigulon-recordings/recordings/org-1/agent-1/call-1.wav?sig=abc",
            "format": "wav",
            "durationSeconds": 12.5,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }

        finalized = await finalize_call(
            call_id="call-1",
            outcome="completed",
            duration_seconds=13,
            tenant_id="org-1",
            agent_id="agent-1",
            recording_data=recording_info,
        )

        self.assertTrue(finalized)
        mock_client.calls.update_one.assert_called()
        update_args = mock_client.calls.update_one.call_args[0][1]["$set"]
        self.assertIn("recording", update_args)
        self.assertEqual(update_args["recording"]["status"], "completed")
        self.assertEqual(update_args["metadata.recordingUrl"], recording_info["url"])


if __name__ == "__main__":
    unittest.main()
