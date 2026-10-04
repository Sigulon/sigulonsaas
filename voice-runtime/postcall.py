"""Post-call intelligence: transcript capture + summary/outcome extraction.

The LiveKit AgentSession emits transcript events during the call. When the
session ends, agent.py snapshots them here (plain ``agent``/``user`` turns),
optionally asks LLM for a structured recap, and POSTs both to the control
API — so the dashboard shows real transcripts and dispositions, and the
control plane sends WhatsApp/email to the owner.

Everything is best-effort: extraction failures are swallowed upstream and
the transcript still persists. No extraction = no summary, never a lost call.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

log = logging.getLogger("voice-runtime.postcall")

OUTCOMES = (
    "interested",
    "not_interested",
    "callback_requested",
    "voicemail",
    "busy",
    "wrong_number",
    "completed",
)

_SUMMARY_PROMPT = """\
You are a call analyst for a voice-calling business. Read this phone call
transcript and reply with EXACTLY one JSON object (no fences, no prose):

{"summary": "<=40 words, neutral, third person>", "outcome": "<one of: %s>"}

Outcome guide:
- interested: caller wants the offering / agreed to next steps
- not_interested: declined, asked not to be called, wrong fit
- callback_requested: asked to call back later
- voicemail: reached voicemail / answering machine
- busy: line busy, conversation never started
- wrong_number: not the intended person/number
- completed: anything else / informational

Transcript:
%s
"""


def transcript_from_context(context: Any) -> list[dict[str, str]]:
    """Flatten a conversation into ``[{role, text}]`` (agent/user only).

    Accepts: a legacy ``LLMContext`` (``get_messages()``), a LiveKit session
    (``chat_ctx`` / ``history``), or a plain list of ``{role, text}`` /
    transcript-event dicts. Never raises.
    """
    turns: list[dict[str, str]] = []
    try:
        if isinstance(context, list):
            messages = context
        elif context is None:
            return turns
        elif hasattr(context, "get_messages"):
            messages = context.get_messages() or []
        else:
            chat_ctx = getattr(context, "chat_ctx", None) or getattr(context, "history", None)
            messages = chat_ctx.get_messages() if hasattr(chat_ctx, "get_messages") else (chat_ctx or [])
    except Exception:  # noqa: BLE001 - snapshot must never raise
        return turns
    for message in messages or []:
        if isinstance(message, dict):
            role = str(message.get("role", "") or "")
            text = str(message.get("text", message.get("content", "")) or "").strip()
        else:
            role = getattr(message, "role", "")
            content = getattr(message, "content", "")
            if isinstance(content, list):  # multimodal parts — keep text parts
                content = " ".join(
                    str(part.get("text", "")) if isinstance(part, dict) else str(part)
                    for part in content
                )
            text = str(content or "").strip()
        if not text:
            continue
        if role in ("assistant", "agent"):
            turns.append({"role": "agent", "text": text})
        elif role == "user":
            turns.append({"role": "user", "text": text})
        # system instructions are config, not conversation — skip
    return turns


def transcript_from_events(events: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Build ``[{role, text}]`` from collected AgentSession transcript events."""
    return transcript_from_context(events)


def parse_summary_response(raw: str) -> dict[str, str]:
    """Parse the extractor's JSON (tolerates fences/prose); safe defaults."""
    fallback = {"summary": "", "outcome": "completed"}
    text = (raw or "").strip()
    if not text:
        return fallback
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    if not candidate.lstrip().startswith("{"):
        braced = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = braced.group(0) if braced else ""
    try:
        data = json.loads(candidate)
    except (ValueError, TypeError):
        return fallback
    if not isinstance(data, dict):
        return fallback
    summary = str(data.get("summary", "")).strip()[:2000]
    outcome = str(data.get("outcome", "")).strip().lower()
    return {
        "summary": summary,
        "outcome": outcome if outcome in OUTCOMES else "completed",
    }


def summary_prompt(transcript: list[dict[str, str]]) -> str:
    """Build the extractor prompt (pure — unit-testable)."""
    lines = [
        f"{turn['role']}: {turn['text']}"
        for turn in transcript
        if turn.get("text")
    ]
    return _SUMMARY_PROMPT % (", ".join(OUTCOMES), "\n".join(lines))


async def summarize_call(
    transcript: list[dict[str, str]],
    *,
    api_key: str = "",
    model: str | None = None,
    timeout_seconds: float = 20.0,
) -> Optional[dict[str, str]]:
    """Extract {summary, outcome} from transcript using heuristic analysis. None on empty input."""
    if not transcript:
        return None

    # Analyze transcript text for sentiment / outcome detection
    user_texts = [turn["text"].lower() for turn in transcript if turn.get("role") == "user" and turn.get("text")]
    all_user_text = " ".join(user_texts)

    outcome = "completed"
    if any(kw in all_user_text for kw in ("not interested", "dont call", "don't call", "stop calling", "wrong number", "no thank")):
        if "wrong number" in all_user_text:
            outcome = "wrong_number"
        else:
            outcome = "not_interested"
    elif any(kw in all_user_text for kw in ("call back", "call later", "tomorrow", "busy right now", "call me back")):
        outcome = "callback_requested"
    elif any(kw in all_user_text for kw in ("yes", "interested", "sure", "book", "site visit", "appointment", "details", "whatsapp")):
        outcome = "interested"
    elif not user_texts:
        outcome = "voicemail" if len(transcript) <= 1 else "completed"

    turns_count = len(transcript)
    summary = f"Call completed with {turns_count} turns. Outcome: {outcome.replace('_', ' ')}."

    log.info("summary extracted (outcome=%s, turns=%d)", outcome, turns_count)
    return {
        "summary": summary,
        "outcome": outcome,
    }


def build_postcall_payload(
    *,
    call_id: str,
    transcript: list[dict[str, str]],
    summary: dict[str, str] | None,
    duration_seconds: float = 0,
    room_name: str = "",
    captured_variables: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the control-plane postcall body (transcript + summary + outcome + captured variables)."""
    return {
        "call_id": call_id,
        "room_name": room_name or call_id,
        "transcript": transcript,
        "summary": (summary or {}).get("summary", ""),
        "outcome": (summary or {}).get("outcome", "completed"),
        "duration_seconds": duration_seconds,
        "captured_variables": captured_variables or {},
    }


async def post_postcall(
    payload: dict[str, Any],
    *,
    web_base: str | None = None,
    secret: str | None = None,
    timeout_seconds: float = 10.0,
) -> bool:
    """POST transcript+summary to the control API (owner notify fan-out).

    Endpoint: POST {INTERNAL_API_BASE_URL}/api/internal/calls/postcall.
    Best-effort: returns False on any failure, never raises.
    """
    import os as _os

    base = (web_base if web_base is not None else _os.getenv("INTERNAL_API_BASE_URL", "")).rstrip("/")
    token = secret if secret is not None else _os.getenv("INTERNAL_API_SECRET", "")
    if not base or not token:
        return False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                f"{base}/api/internal/calls/postcall",
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
            )
        if response.status_code >= 400:
            log.warning("postcall POST failed: HTTP %d", response.status_code)
            return False
        return True
    except Exception as exc:  # noqa: BLE001 - postcall never breaks cleanup
        log.warning("postcall POST failed: %s", exc)
        return False


__all__ = [
    "OUTCOMES",
    "build_postcall_payload",
    "parse_summary_response",
    "post_postcall",
    "summarize_call",
    "summary_prompt",
    "transcript_from_context",
    "transcript_from_events",
]
