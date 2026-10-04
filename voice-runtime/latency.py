"""Low-overhead, per-turn voice latency instrumentation (LiveKit Agents).

The tracker observes AgentSession events rather than legacy-rtc frames. It never
buffers audio/text and deliberately logs only call IDs, stage names, and
durations — keeping the same `[voice-latency]` / `[voice-latency-summary]`
formats so existing dashboards keep working.

Stages (all ms since user turn end):
  user_stops_speaking -> stt_first_transcript -> llm_request -> llm_ttft ->
  tts_request -> tts_ttfb / first_audio_generated -> first_audio_sent
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("voice-runtime.latency")


@dataclass
class TurnLatency:
    turn: int
    turn_end: float
    stt_final: Optional[float] = None
    llm_request: Optional[float] = None
    llm_ttft: Optional[float] = None
    llm_total: Optional[float] = None
    tts_request: Optional[float] = None
    tts_ttfb: Optional[float] = None
    first_audio: Optional[float] = None
    emitted: bool = False


class VoiceLatencyTracker:
    """Tracks one active response turn for a single LiveKit room."""

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
            log.info("[voice] llm first token")
        if self._current.tts_request is None:
            self._current.tts_request = now
            self._stage(self._current, "tts_request", now)
            log.info("[voice] tts request started")

    def mark_llm_complete(self) -> None:
        if self._current is None or self._current.llm_total is not None:
            return
        now = time.perf_counter()
        self._current.llm_total = now
        self._stage(self._current, "llm_total", now)
        log.info("[voice] llm response ready")

    def mark_tts_audio(self) -> None:
        if self._current is None:
            return
        now = time.perf_counter()
        if self._current.tts_ttfb is None:
            self._current.tts_ttfb = now
            self._stage(self._current, "tts_ttfb", now)
            self._stage(self._current, "first_audio_generated", now)
            log.info("[voice] tts first audio received")

    def mark_first_audio_sent(self) -> None:
        if self._current is None or self._current.first_audio is not None:
            return
        now = time.perf_counter()
        self._current.first_audio = now
        self._stage(self._current, "first_audio_sent", now)

    # Back-compat aliases for the legacy-rtc-era call sites.
    mark_cartesia_audio = mark_tts_audio
    mark_plivo_first_audio = mark_first_audio_sent

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
            self._ms(turn.tts_request or turn.turn_end, turn.tts_ttfb),
            self._ms(turn.turn_end, turn.first_audio),
        )


def attach_latency_hooks(session: object, tracker: VoiceLatencyTracker) -> None:
    """Wire an AgentSession's events to the tracker (best-effort, version-tolerant).

    Hooks: user transcript -> mark_stt_final, agent speech started ->
    mark_llm_text/mark_tts_audio, metrics_collected -> stage mapping.
    Missing hooks degrade to no-op rather than breaking the call.
    """
    try:
        on = getattr(session, "on", None)
        if not callable(on):
            return

        def _on_user_transcript(*args: object, **kwargs: object) -> None:
            tracker.mark_stt_final()

        def _on_agent_speech(*args: object, **kwargs: object) -> None:
            tracker.mark_llm_text()
            tracker.mark_tts_audio()

        def _on_metrics(ev: object) -> None:
            try:
                mtype = getattr(getattr(ev, "metrics", ev), "type", "")
                if mtype == "llm_metrics":
                    ttft = getattr(getattr(ev, "metrics", ev), "ttft", None)
                    if ttft:
                        tracker.mark_llm_text()
                elif mtype == "tts_metrics":
                    ttfb = getattr(getattr(ev, "metrics", ev), "ttfb", None)
                    if ttfb:
                        tracker.mark_tts_audio()
            except Exception:  # noqa: BLE001 - metrics never break audio
                pass

        for event, cb in (
            ("user_transcript", _on_user_transcript),
            ("user_input_transcribed", _on_user_transcript),
            ("agent_speech_started", _on_agent_speech),
            ("agent_audio_started", _on_agent_speech),
            ("metrics_collected", _on_metrics),
        ):
            try:
                on(event)(cb)  # type: ignore[operator]
            except Exception:  # noqa: BLE001 - tolerant across SDK versions
                try:
                    on(event, cb)  # type: ignore[call-arg]
                except Exception:
                    pass
    except Exception:  # noqa: BLE001 - hooks are observability only
        log.debug("[voice-latency] hook attach skipped", exc_info=True)


__all__ = ["TurnLatency", "VoiceLatencyTracker", "attach_latency_hooks"]
