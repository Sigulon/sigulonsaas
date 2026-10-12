"""Per-call ownership of SDK events, media teardown and final transcripts."""
from __future__ import annotations

import asyncio
import logging
import time

log = logging.getLogger("voice-runtime.lifecycle")


async def terminate_room(ctx, *, shutdown=True) -> None:
    """A job ending alone does not hang up SIP participants."""
    if ctx is None:
        return
    try:
        await asyncio.wait_for(ctx.delete_room(), timeout=10)
    except Exception:
        log.exception("[voice] room deletion failed")
    finally:
        if shutdown:
            ctx.shutdown(reason="voice call ended")


class CallLifecycle:
    def __init__(self, ctx):
        self.ctx = ctx
        self.session = None
        self.resources = []
        self.started = None
        self.duration = 0.0
        self._close_task = None

    async def close(self):
        # A single task survives cancellation of the caller and owns teardown.
        if self._close_task is None:
            self._close_task = asyncio.create_task(self._close())
        await asyncio.shield(self._close_task)

    async def _close(self):
        try:
            if self.session is not None:
                try:
                    await asyncio.wait_for(self.session.aclose(), timeout=10)
                except Exception:
                    log.exception("[voice] session close failed")
        finally:
            self.duration = time.monotonic() - self.started if self.started is not None else 0
            await terminate_room(self.ctx, shutdown=False)
            for resource in reversed(self.resources):
                close = getattr(resource, "aclose", None)
                if close is not None:
                    try:
                        await asyncio.wait_for(close(), timeout=5)
                    except Exception:
                        log.exception("[voice] provider close failed")


def attach_transcripts(session, events, tracker):
    """Committed chat messages are authoritative, including interrupted speech.

    STT finals are timing signals only: collecting both them and committed user
    messages duplicates turns (provider item IDs need not be chat message IDs).
    """
    seen = set()

    @session.on("conversation_item_added")
    def on_item(ev):
        item = ev.item
        if getattr(item, "type", None) != "message":
            return
        role = {"user": "user", "assistant": "agent"}.get(item.role)
        text = getattr(item, "text_content", None) or getattr(item, "content", "") or ""
        if isinstance(text, list):
            text = " ".join(
                str(part.get("text", "")) if isinstance(part, dict) else str(part)
                for part in text
            )
        item_key = getattr(item, "id", None) or id(item)
        if role and text.strip() and item_key not in seen:
            seen.add(item_key)
            events.append({"role": role, "text": text.strip()})

    @session.on("user_input_transcribed")
    def on_final(ev):
        if ev.is_final:
            tracker.mark_stt_final()


class SessionEnd:
    """Install before start/greeting so early close events cannot be lost."""
    def __init__(self, ctx, session):
        self.room = ctx.room
        self.session = session
        self.event = asyncio.Event()
        self.caller_identity = None
        self.departed = set()
        self.room.on("disconnected", self.on_close)
        self.room.on("participant_disconnected", self.on_departure)
        self.session.on("close", self.on_close)

    def on_close(self, *args):
        self.event.set()

    def on_departure(self, participant):
        self.departed.add(participant.identity)
        # Use the explicitly linked caller; observers must not end calls.
        if participant.identity == self.caller_identity:
            self.event.set()

    def bind_caller(self, identity):
        self.caller_identity = identity
        # Departure can precede resumption of wait_for_participant's future.
        if identity in self.departed:
            self.event.set()

    def detach(self):
        self.room.off("disconnected", self.on_close)
        self.room.off("participant_disconnected", self.on_departure)
        self.session.off("close", self.on_close)

    async def run(self, operation, cap):
        start = time.monotonic()
        work = asyncio.create_task(operation)
        ended = asyncio.create_task(self.event.wait())
        try:
            done, _ = await asyncio.wait({work, ended}, timeout=cap,
                                         return_when=asyncio.FIRST_COMPLETED)
            if not done:
                raise asyncio.TimeoutError
            if work in done:
                await work
                # Startup completed: keep waiting, using the same call deadline.
                await asyncio.wait_for(ended, max(0, cap - (time.monotonic() - start)))
        finally:
            for task in (work, ended):
                task.cancel()
            await asyncio.gather(work, ended, return_exceptions=True)
            self.detach()
