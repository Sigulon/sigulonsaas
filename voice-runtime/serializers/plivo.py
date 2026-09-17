"""Custom Pipecat :class:`FrameSerializer` for Plivo Audio Streaming.

Protocol reference (verified against Plivo's Audio Streaming Protocol
Reference, Jan 2026 — ``/docs/voice-agents/audio-streaming/concepts/
audio-streaming-reference``):

* Inbound (Plivo -> us), one JSON message per WebSocket frame:
  ``start``      ``{"event": "start", "sequenceNumber": 1,
                    "start": {"callId", "streamId", "accountId",
                              "tracks": ["inbound"],
                              "mediaFormat": {"encoding": "audio/x-mulaw",
                                              "sampleRate": 8000}}}``
  ``media``      ``{"event": "media", "sequenceNumber": N, "streamId": ...,
                    "media": {"track": "inbound", "timestamp": "<ms>",
                              "chunk": N, "payload": "<base64 mulaw>"}}``
  ``dtmf``       ``{"event": "dtmf", ..., "dtmf": {"track", "digit", "timestamp"}}``
  ``playedStream`` / ``clearedAudio``: playback confirmations (informational).
* Outbound (us -> Plivo):
  ``playAudio``  ``{"event": "playAudio",
                    "media": {"contentType": "audio/x-mulaw",
                              "sampleRate": 8000, "payload": "<base64>"}}``
  ``clearAudio`` ``{"event": "clearAudio", "streamId": ...}`` (barge-in).
  ``checkpoint`` ``{"event": "checkpoint", "streamId": ..., "name": ...}``.

Important corrections to common assumptions:

* There is **no** ``stop`` event on the WebSocket. Call end is signalled by
  the WebSocket closing; ``stopped``/``failed`` are delivered to the
  ``statusCallbackUrl`` over HTTP, not over the stream socket.
* Upstream ``pipecat.serializers.plivo.PlivoFrameSerializer`` exists, but it
  requires ``stream_id``/``call_id``/credentials up front. This serializer
  instead **learns** ``stream_id``/``call_id`` from the live ``start`` event,
  which is the only workable shape for a server transport where the
  serializer is constructed at WebSocket-accept time, before Plivo speaks.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
from typing import Callable, Optional, cast

from pipecat.audio.dtmf.types import KeypadEntry
from pipecat.audio.utils import create_stream_resampler, pcm_to_ulaw, ulaw_to_pcm
from pipecat.frames.frames import (
    AudioRawFrame,
    CancelFrame,
    EndFrame,
    Frame,
    InputAudioRawFrame,
    InputDTMFFrame,
    InterruptionFrame,
    OutputTransportMessageFrame,
    OutputTransportMessageUrgentFrame,
)
from pipecat.processors.frame_processor import FrameProcessorSetup
from pipecat.serializers.base_serializer import FrameSerializer

log = logging.getLogger("voice-runtime.plivo-serializer")

PLIVO_SAMPLE_RATE = 8000
PLIVO_ENCODING = "audio/x-mulaw"


class SigulonPlivoSerializer(FrameSerializer):
    """Plivo Audio Streaming <-> Pipecat frame translation.

    Args:
        plivo_sample_rate: Sample rate Plivo streams (8000 for mulaw/8kHz).
        sample_rate: Optional override for the pipeline-side PCM rate.
            Defaults to the pipeline's ``audio_in_sample_rate`` from ``setup()``.
        auto_hang_up: On ``EndFrame``/``CancelFrame``, hang the call up via the
            Plivo REST API (requires ``call_id`` — from the ``start`` event or
            the constructor — plus ``auth_id``/``auth_token``). Disabled by
            default; the WebSocket close + ``main.py`` cleanup is the primary
            end-of-call path.
    """

    class InputParams(FrameSerializer.InputParams):
        plivo_sample_rate: int = PLIVO_SAMPLE_RATE
        sample_rate: Optional[int] = None
        auto_hang_up: bool = False

    def __init__(
        self,
        *,
        call_id: Optional[str] = None,
        auth_id: Optional[str] = None,
        auth_token: Optional[str] = None,
        on_first_audio: Optional[Callable[[], None]] = None,
        params: Optional["SigulonPlivoSerializer.InputParams"] = None,
    ) -> None:
        params = params or SigulonPlivoSerializer.InputParams()
        super().__init__(params)
        self._params: SigulonPlivoSerializer.InputParams = params

        # Learned from the live `start` event; constructor values are overrides.
        self._stream_id: Optional[str] = None
        self._call_id: Optional[str] = call_id
        self._auth_id = auth_id
        self._auth_token = auth_token
        self._on_first_audio = on_first_audio
        self._first_audio_sent = False
        self._first_audio_received = False

        self._plivo_sample_rate = self._params.plivo_sample_rate
        self._sample_rate = self._params.sample_rate or 0  # set in setup()

        self._input_resampler = create_stream_resampler(
            clear_after_secs=self._params.resampler_clear_after_secs
        )
        self._output_resampler = create_stream_resampler(
            clear_after_secs=self._params.resampler_clear_after_secs
        )
        self._hangup_attempted = False

    # -- introspection (used by main.py for logging / REST hangup) --------

    @property
    def stream_id(self) -> Optional[str]:
        return self._stream_id

    @property
    def plivo_call_id(self) -> Optional[str]:
        return self._call_id

    # -- FrameSerializer interface ------------------------------------------

    async def setup(self, setup: FrameProcessorSetup) -> None:
        if not self._sample_rate:
            self._sample_rate = setup.audio_in_sample_rate

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, (EndFrame, CancelFrame)):
            if self._params.auto_hang_up and not self._hangup_attempted:
                self._hangup_attempted = True
                await self._hang_up_call()
            return None

        if isinstance(frame, InterruptionFrame):
            # Barge-in: drop queued agent audio so the caller is heard now.
            message: dict = {"event": "clearAudio"}
            if self._stream_id:
                message["streamId"] = self._stream_id
            return json.dumps(message)

        if isinstance(frame, AudioRawFrame):
            if not self._sample_rate:
                log.warning("Dropping outbound audio: serializer not set up yet")
                return None
            ulaw = await pcm_to_ulaw(
                frame.audio, frame.sample_rate, self._plivo_sample_rate,
                self._output_resampler,
            )
            if not ulaw:
                return None
            if not self._first_audio_sent:
                self._first_audio_sent = True
                log.info("[voice] plivo audio sent")
                log.info("[plivo] first audio sent")
                if self._on_first_audio:
                    self._on_first_audio()
            return json.dumps(
                {
                    "event": "playAudio",
                    "media": {
                        "contentType": PLIVO_ENCODING,
                        "sampleRate": self._plivo_sample_rate,
                        "payload": base64.b64encode(ulaw).decode("utf-8"),
                    },
                }
            )

        if isinstance(frame, (OutputTransportMessageFrame, OutputTransportMessageUrgentFrame)):
            if self.should_ignore_frame(frame):
                return None
            return json.dumps(frame.message)

        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        try:
            message = json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            log.warning("Dropping non-JSON Plivo message (%d bytes)", len(data))
            return None

        if not isinstance(message, dict):
            return None

        event = message.get("event")

        if event == "start":
            start = message.get("start", {}) or {}
            self._stream_id = start.get("streamId") or self._stream_id
            # Prefer the live callId; keep a constructor-provided override.
            self._call_id = start.get("callId") or self._call_id
            log.info(
                "Plivo stream started (call_id=%s stream_id=%s tracks=%s)",
                self._call_id, self._stream_id, start.get("tracks"),
            )
            return None

        if event == "media":
            payload_b64 = (message.get("media", {}) or {}).get("payload")
            if not payload_b64:
                return None
            if not self._sample_rate:
                log.warning("Dropping inbound audio: serializer not set up yet")
                return None
            try:
                ulaw = base64.b64decode(payload_b64)
            except (binascii.Error, ValueError):
                log.warning("Dropping media frame with invalid base64 payload")
                return None
            pcm = await ulaw_to_pcm(
                ulaw, self._plivo_sample_rate, self._sample_rate,
                self._input_resampler,
            )
            if not pcm:
                return None
            if not self._first_audio_received:
                self._first_audio_received = True
                log.info("[plivo] first audio received")
            return InputAudioRawFrame(
                audio=pcm, num_channels=1, sample_rate=self._sample_rate
            )

        if event == "dtmf":
            digit = (message.get("dtmf", {}) or {}).get("digit")
            if not digit:
                return None
            try:
                return InputDTMFFrame(KeypadEntry(digit))
            except ValueError:
                log.warning("Ignoring invalid DTMF digit: %r", digit)
                return None

        if event in ("playedStream", "clearedAudio"):
            # Playback confirmations; useful for future checkpoint tracking.
            log.debug("Plivo playback event: %s", event)
            return None

        log.debug("Ignoring unhandled Plivo event: %r", event)
        return None

    # -- REST hangup (optional) ----------------------------------------------

    async def _hang_up_call(self) -> None:
        """Hang the live call up via Plivo's REST API (best-effort)."""
        if not (self._call_id and self._auth_id and self._auth_token):
            log.warning("auto_hang_up requested without call_id/auth; skipping REST hangup")
            return
        try:
            import aiohttp

            endpoint = (
                f"https://api.plivo.com/v1/Account/{self._auth_id}"
                f"/Call/{cast(str, self._call_id)}/"
            )
            auth = aiohttp.BasicAuth(self._auth_id, self._auth_token)
            async with aiohttp.ClientSession() as session:
                async with session.delete(endpoint, auth=auth) as response:
                    if response.status in (204, 404):
                        log.info("Plivo call %s terminated (HTTP %d)", self._call_id, response.status)
                    else:
                        body = await response.text()
                        log.error(
                            "Plivo hangup failed for %s: HTTP %d %s",
                            self._call_id, response.status, body,
                        )
        except Exception as exc:  # noqa: BLE001 - hangup must not break teardown
            log.error("Plivo REST hangup error: %s", exc)
