"""Low-overhead, per-turn voice latency instrumentation.

The tracker observes frames already flowing through Pipecat. It never buffers
audio/text and deliberately logs only call IDs, stage names, and durations.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TTSAudioRawFrame,
    TTSStoppedFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

log = logging.getLogger("voice-runtime.latency")


@dataclass
class TurnLatency:
    turn: int
    turn_end: float
    stt_final: Optional[float] = None
    llm_request: Optional[float] = None
    llm_ttft: Optional[float] = None
    llm_total: Optional[float] = None
    cartesia_request: Optional[float] = None
    cartesia_ttfb: Optional[float] = None
    plivo_first_audio: Optional[float] = None
    emitted: bool = False


class VoiceLatencyTracker:
    """Tracks one active response turn for a single WebSocket call."""

    def __init__(self, call_id: str) -> None:
        self.call_id = call_id
        self._turn_number = 0
        self._current: Optional[TurnLatency] = None

    @staticmethod
    def _ms(started: float, ended: Optional[float]) -> Optional[int]:
        return None if ended is None else round((ended - started) * 1000)

    def _stage(self, turn: TurnLatency, stage: str, timestamp: float) -> None:
        log.info(
            "[voice-latency] callId=%s turn=%d stage=%s durationMs=%d",
            self.call_id,
            turn.turn,
            stage,
            round((timestamp - turn.turn_end) * 1000),
        )

    def mark_turn_end(self) -> None:
        # A new endpoint replaces only a completed/output turn. Repeated VAD
        # frames for the same endpoint must not reset the measurement.
        if self._current and not self._current.emitted and self._current.stt_final is None:
            return
        self._turn_number += 1
        self._current = TurnLatency(turn=self._turn_number, turn_end=time.perf_counter())
        self._stage(self._current, "user_stops_speaking", self._current.turn_end)

    def mark_stt_final(self) -> None:
        now = time.perf_counter()
        if self._current is None:
            self.mark_turn_end()
        assert self._current is not None
        if self._current.stt_final is None:
            self._current.stt_final = now
            self._stage(self._current, "stt_first_transcript", now)
        if self._current.llm_request is None:
            self._current.llm_request = now
            self._stage(self._current, "llm_request", now)

    def mark_llm_started(self) -> None:
        if self._current is None:
            return
        if self._current.llm_request is None:
            now = time.perf_counter()
            self._current.llm_request = now
            self._stage(self._current, "llm_request", now)

    def mark_llm_text(self) -> None:
        if self._current is None:
            return
        now = time.perf_counter()
        if self._current.llm_ttft is None:
            self._current.llm_ttft = now
            self._stage(self._current, "llm_ttft", now)
        if self._current.cartesia_request is None:
            self._current.cartesia_request = now
            self._stage(self._current, "tts_request", now)

    def mark_llm_complete(self) -> None:
        if self._current is None or self._current.llm_total is not None:
            return
        now = time.perf_counter()
        self._current.llm_total = now
        self._stage(self._current, "llm_total", now)


    def mark_cartesia_audio(self) -> None:
        if self._current is None:
            return
        now = time.perf_counter()
        if self._current.cartesia_ttfb is None:
            self._current.cartesia_ttfb = now
            self._stage(self._current, "tts_ttfb", now)
            self._stage(self._current, "first_audio_generated", now)

    def mark_plivo_first_audio(self) -> None:
        if self._current is None or self._current.plivo_first_audio is not None:
            return
        now = time.perf_counter()
        self._current.plivo_first_audio = now
        self._stage(self._current, "first_audio_sent_to_plivo", now)

    def emit_summary(self) -> None:
        turn = self._current
        if turn is None or turn.emitted:
            return
        turn.emitted = True
        log.info(
            "[voice-latency-summary] callId=%s turn=%d sttMs=%s llmTtftMs=%s "
            "llmTotalMs=%s cartesiaTtfbMs=%s firstAudioMs=%s",
            self.call_id,
            turn.turn,
            self._ms(turn.turn_end, turn.stt_final),
            self._ms(turn.llm_request or turn.turn_end, turn.llm_ttft),
            self._ms(turn.llm_request or turn.turn_end, turn.llm_total),
            self._ms(turn.cartesia_request or turn.turn_end, turn.cartesia_ttfb),
            self._ms(turn.turn_end, turn.plivo_first_audio),
        )


class TurnEndLatencyProcessor(FrameProcessor):
    def __init__(self, tracker: VoiceLatencyTracker) -> None:
        super().__init__()
        self._tracker = tracker

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, UserStartedSpeakingFrame):
            log.info("[voice] user speech detected")
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._tracker.mark_turn_end()
        await self.push_frame(frame, direction)


class SttLatencyProcessor(FrameProcessor):
    def __init__(self, tracker: VoiceLatencyTracker) -> None:
        super().__init__()
        self._tracker = tracker
        self._first_transcript_logged = False

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            self._tracker.mark_stt_final()
            log.info("[voice] transcript=%s", getattr(frame, "text", ""))
            if not self._first_transcript_logged:
                self._first_transcript_logged = True
                log.info("[cartesia-stt] first transcript received")
        await self.push_frame(frame, direction)


class LlmLatencyProcessor(FrameProcessor):
    def __init__(self, tracker: VoiceLatencyTracker) -> None:
        super().__init__()
        self._tracker = tracker
        self._first_llm_token_logged = False

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._tracker.mark_llm_started()
        elif isinstance(frame, LLMTextFrame):
            self._tracker.mark_llm_text()
            if not self._first_llm_token_logged:
                self._first_llm_token_logged = True
                log.info("[voice] llm first token")
                log.info("[voice] tts request started")
                log.info("[openrouter] first Gemini token received")
        elif isinstance(frame, LLMFullResponseEndFrame):
            self._tracker.mark_llm_complete()
            log.info("[voice] llm response ready")
        await self.push_frame(frame, direction)


class TtsLatencyProcessor(FrameProcessor):
    def __init__(self, tracker: VoiceLatencyTracker) -> None:
        super().__init__()
        self._tracker = tracker
        self._first_tts_audio_logged = False

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TTSAudioRawFrame):
            self._tracker.mark_cartesia_audio()
            if not self._first_tts_audio_logged:
                self._first_tts_audio_logged = True
                log.info("[voice] tts first audio received")
                log.info("[cartesia-tts] first audio generated")
        elif isinstance(frame, TTSStoppedFrame):
            self._tracker.emit_summary()
        await self.push_frame(frame, direction)
