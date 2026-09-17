"""Call audio recording for the Sigulon voice runtime.

Captures synchronized dual-track audio (caller input and bot output) across
the Pipecat pipeline, mixes into a standard 16kHz 16-bit PCM WAV file,
and asynchronously uploads to Google Cloud Storage (GCS) with a signed URL.

Key design points:
* Tap processors are lightweight Pipecat FrameProcessor nodes placed in the
  pipeline: user tap right after transport.input(), bot tap right after
  tts (before transport.output()).
* Wall-clock silence gap injection ensures user pauses, bot response latency,
  and turn-taking stay temporally synchronized.
* GCS upload runs in asyncio.to_thread to avoid blocking the event loop or
  delaying socket closure.
* Graceful fallback: missing GCS credentials or upload errors log warnings,
  save a local copy if possible, and return a structured status without
  raising or crashing live calls.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import time
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from pipecat.audio.utils import mix_audio
from pipecat.frames.frames import AudioRawFrame, Frame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

log = logging.getLogger("voice-runtime.recording")

DEFAULT_SAMPLE_RATE = 16000
DEFAULT_GCS_BUCKET = "sigulon-recordings"
DEFAULT_SIGNED_URL_EXPIRATION_SECS = 86400  # 24 hours


class AudioTapProcessor(FrameProcessor):
    """Pipeline tap that captures audio frames without blocking or modifying them."""

    def __init__(self, recorder: CallAudioRecorder, track: str, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.recorder = recorder
        self.track = track  # "user" or "bot"

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, AudioRawFrame) and frame.audio:
            self.recorder.append_audio(
                self.track, frame.audio, getattr(frame, "sample_rate", DEFAULT_SAMPLE_RATE)
            )
        await self.push_frame(frame, direction)


class CallAudioRecorder:
    """Manages dual-track audio buffers, temporal alignment, and WAV packaging."""

    def __init__(
        self,
        *,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        num_channels: int = 1,
    ) -> None:
        self.sample_rate = sample_rate
        self.num_channels = num_channels
        self.bytes_per_sample = 2  # 16-bit PCM

        self.user_audio = bytearray()
        self.bot_audio = bytearray()

        self._last_user_time: Optional[float] = None
        self._last_bot_time: Optional[float] = None

        self.user_tap = AudioTapProcessor(self, track="user")
        self.bot_tap = AudioTapProcessor(self, track="bot")

    def append_audio(self, track: str, audio: bytes, sample_rate: int) -> None:
        """Append an audio chunk with silence gap injection for accurate sync."""
        if not audio:
            return

        now = time.monotonic()
        bytes_per_sec = self.sample_rate * self.bytes_per_sample

        if track == "user":
            if self._last_user_time is not None:
                elapsed = now - self._last_user_time
                frame_duration = len(audio) / bytes_per_sec
                gap = elapsed - frame_duration
                if gap > 0.2:  # > 200ms silence gap
                    silence_bytes = int(gap * bytes_per_sec)
                    silence_bytes -= silence_bytes % self.bytes_per_sample
                    if silence_bytes > 0:
                        self.user_audio.extend(b"\x00" * silence_bytes)

            self._last_user_time = now
            # Sync bot buffer to current user position so tracks start aligned
            if len(self.bot_audio) < len(self.user_audio):
                pad_len = len(self.user_audio) - len(self.bot_audio)
                self.bot_audio.extend(b"\x00" * pad_len)
            self.user_audio.extend(audio)

        elif track == "bot":
            if self._last_bot_time is not None:
                elapsed = now - self._last_bot_time
                frame_duration = len(audio) / bytes_per_sec
                gap = elapsed - frame_duration
                if gap > 0.2:
                    silence_bytes = int(gap * bytes_per_sec)
                    silence_bytes -= silence_bytes % self.bytes_per_sample
                    if silence_bytes > 0:
                        self.bot_audio.extend(b"\x00" * silence_bytes)

            self._last_bot_time = now
            # Sync user buffer to current bot position so tracks start aligned
            if len(self.user_audio) < len(self.bot_audio):
                pad_len = len(self.bot_audio) - len(self.user_audio)
                self.user_audio.extend(b"\x00" * pad_len)
            self.bot_audio.extend(audio)

    def finalize_recording(self) -> tuple[bytes, float]:
        """Align buffers, mix to 16kHz 16-bit WAV, and return (wav_bytes, duration_seconds)."""
        target_len = max(len(self.user_audio), len(self.bot_audio))
        if target_len == 0:
            return b"", 0.0

        # Pad shorter buffer to equal length with silence
        if len(self.user_audio) < target_len:
            self.user_audio.extend(b"\x00" * (target_len - len(self.user_audio)))
        if len(self.bot_audio) < target_len:
            self.bot_audio.extend(b"\x00" * (target_len - len(self.bot_audio)))

        # Mix user and bot tracks
        try:
            mixed_pcm = mix_audio(bytes(self.user_audio), bytes(self.bot_audio))
        except Exception as exc:
            log.warning("mix_audio failed, falling back to single track: %s", exc)
            mixed_pcm = bytes(self.bot_audio) if len(self.bot_audio) > 0 else bytes(self.user_audio)

        bytes_per_second = self.sample_rate * self.bytes_per_sample * self.num_channels
        duration_seconds = round(len(mixed_pcm) / bytes_per_second, 2)

        # Encode standard WAV header
        buf = io.BytesIO()
        try:
            with wave.open(buf, "wb") as wav_out:
                wav_out.setnchannels(self.num_channels)
                wav_out.setsampwidth(self.bytes_per_sample)
                wav_out.setframerate(self.sample_rate)
                wav_out.writeframes(mixed_pcm)
            wav_bytes = buf.getvalue()
        except Exception as exc:
            log.error("WAV header creation failed: %s", exc)
            return b"", 0.0

        log.info(
            "Call recording finalized: duration=%.2fs, size=%d bytes (user=%d, bot=%d)",
            duration_seconds, len(wav_bytes), len(self.user_audio), len(self.bot_audio),
        )
        return wav_bytes, duration_seconds


class GCSRecordingUploader:
    """Handles GCS client creation, upload, and signed URL generation."""

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        signed_url_expiration_secs: Optional[int] = None,
    ) -> None:
        self.bucket_name = (
            bucket_name
            or os.getenv("GCS_BUCKET")
            or DEFAULT_GCS_BUCKET
        )
        self.expiration_secs = (
            signed_url_expiration_secs
            or int(os.getenv("RECORDING_SIGNED_URL_EXPIRATION_SECS", str(DEFAULT_SIGNED_URL_EXPIRATION_SECS)))
        )
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        from google.cloud import storage

        # 1. Inlined service account JSON key via env var
        raw_key = os.getenv("GCS_SERVICE_ACCOUNT_KEY")
        if raw_key:
            try:
                from google.oauth2 import service_account

                info = json.loads(raw_key)
                creds = service_account.Credentials.from_service_account_info(info)
                project = creds.project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
                self._client = storage.Client(credentials=creds, project=project)
                return self._client
            except Exception as exc:
                log.warning("Failed to initialize GCS client from GCS_SERVICE_ACCOUNT_KEY: %s", exc)

        # 2. Path to credentials file (GOOGLE_APPLICATION_CREDENTIALS) or ambient ADC
        project = os.getenv("GOOGLE_CLOUD_PROJECT")
        self._client = storage.Client(project=project)
        return self._client

    def upload_recording_sync(
        self,
        *,
        org_id: str,
        agent_id: str,
        call_id: str,
        wav_bytes: bytes,
        duration_seconds: float,
    ) -> dict[str, Any]:
        """Synchronously upload WAV bytes to GCS and generate a signed URL."""
        object_path = f"recordings/{org_id}/{agent_id}/{call_id}.wav"
        now_iso = datetime.now(timezone.utc).isoformat()

        if not wav_bytes:
            return {
                "status": "failed",
                "storageProvider": "gcs",
                "bucket": self.bucket_name,
                "objectPath": object_path,
                "url": "",
                "format": "wav",
                "durationSeconds": 0,
                "error": "empty_recording_bytes",
                "createdAt": now_iso,
            }

        try:
            client = self._get_client()
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(object_path)

            blob.upload_from_string(
                wav_bytes,
                content_type="audio/wav",
            )
            log.info("Uploaded recording to gs://%s/%s (%d bytes)", self.bucket_name, object_path, len(wav_bytes))

            # Generate v4 signed URL for secure playback
            try:
                signed_url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(seconds=self.expiration_secs),
                    method="GET",
                )
            except Exception as sign_exc:
                log.warning("Signed URL generation failed (fallback to public path format): %s", sign_exc)
                signed_url = f"https://storage.googleapis.com/{self.bucket_name}/{object_path}"

            return {
                "status": "completed",
                "storageProvider": "gcs",
                "bucket": self.bucket_name,
                "objectPath": object_path,
                "url": signed_url,
                "format": "wav",
                "durationSeconds": duration_seconds,
                "sizeBytes": len(wav_bytes),
                "createdAt": now_iso,
            }

        except Exception as exc:
            log.warning("GCS upload failed for call %s: %s", call_id, exc)
            # Local fallback for development / offline resilience
            local_dir = Path("recordings") / org_id / agent_id
            local_path = local_dir / f"{call_id}.wav"
            try:
                local_dir.mkdir(parents=True, exist_ok=True)
                local_path.write_bytes(wav_bytes)
                log.info("Saved recording to local fallback path: %s", local_path)
            except Exception as local_exc:
                log.warning("Failed saving local recording fallback: %s", local_exc)

            return {
                "status": "failed",
                "storageProvider": "gcs",
                "bucket": self.bucket_name,
                "objectPath": object_path,
                "url": "",
                "format": "wav",
                "durationSeconds": duration_seconds,
                "sizeBytes": len(wav_bytes),
                "error": str(exc),
                "createdAt": now_iso,
            }

    async def upload_recording_async(
        self,
        *,
        org_id: str,
        agent_id: str,
        call_id: str,
        wav_bytes: bytes,
        duration_seconds: float,
    ) -> dict[str, Any]:
        """Asynchronously upload WAV recording without blocking the event loop."""
        return await asyncio.to_thread(
            self.upload_recording_sync,
            org_id=org_id,
            agent_id=agent_id,
            call_id=call_id,
            wav_bytes=wav_bytes,
            duration_seconds=duration_seconds,
        )


_uploader = GCSRecordingUploader()


async def upload_call_recording(
    *,
    org_id: str,
    agent_id: str,
    call_id: str,
    wav_bytes: bytes,
    duration_seconds: float,
) -> dict[str, Any]:
    """Helper to asynchronously upload a completed call recording."""
    return await _uploader.upload_recording_async(
        org_id=org_id,
        agent_id=agent_id,
        call_id=call_id,
        wav_bytes=wav_bytes,
        duration_seconds=duration_seconds,
    )
