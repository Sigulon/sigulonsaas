"""Post-call intelligence: transcript capture + summary/outcome extraction.

The pipeline's ``LLMContext`` accumulates every turn. When the call ends,
``main.py`` snapshots it here (plain ``agent``/``user`` turns), optionally
asks LLM for a structured recap, and hands both to ``finalize_call`` —
so the dashboard shows real transcripts and dispositions instead of stubs.

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

OPENROUTER_DEFAULT_MODEL_ENV_VAR = "OPENROUTER_MODEL"
OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-flash"


def default_openrouter_model() -> str:
    """Effective runtime LLM model. Override with the OPENROUTER_MODEL env var."""
    return (
        os.getenv(OPENROUTER_DEFAULT_MODEL_ENV_VAR, OPENROUTER_FALLBACK_MODEL)
        or OPENROUTER_FALLBACK_MODEL
    ).strip() or OPENROUTER_FALLBACK_MODEL

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
    """Flatten an ``LLMContext`` into ``[{role, text}]`` (agent/user only)."""
    turns: list[dict[str, str]] = []
    try:
        messages = context.get_messages() if context is not None else []
    except Exception:  # noqa: BLE001 - snapshot must never raise
        return turns
    for message in messages or []:
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
        if role == "assistant":
            turns.append({"role": "agent", "text": text})
        elif role == "user":
            turns.append({"role": "user", "text": text})
        # system instructions are config, not conversation — skip
    return turns


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
    api_key: str,
    model: str | None = None,
    timeout_seconds: float = 20.0,
) -> Optional[dict[str, str]]:
    """Ask LLM for {summary, outcome}. None on any failure/empty input."""
    if not transcript or not api_key:
        return None
    model = (model or "").strip() or default_openrouter_model()
    try:
        import httpx

        endpoint = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        headers["HTTP-Referer"] = "https://sigulon.ai"
        headers["X-Title"] = "Sigulon Voice Telephony"

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                json={
                    "model": model,
                    "messages": [
                        {"role": "user", "content": summary_prompt(transcript)}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 300,
                },
            )
        if response.status_code >= 400:
            log.warning("summary extraction HTTP %d", response.status_code)
            return None
        data = response.json()
        choices = data.get("choices") or []
        content = (choices[0].get("message") or {}).get("content") or "" if choices else ""
        parsed = parse_summary_response(content)
        if not parsed["summary"]:
            return None
        log.info("summary extracted (outcome=%s)", parsed["outcome"])
        return parsed
    except Exception as exc:  # noqa: BLE001 - extraction never breaks cleanup
        log.warning("summary extraction failed: %s", exc)
        return None


__all__ = [
    "OPENROUTER_DEFAULT_MODEL_ENV_VAR",
    "OPENROUTER_FALLBACK_MODEL",
    "OUTCOMES",
    "default_openrouter_model",
    "parse_summary_response",
    "summarize_call",
    "summary_prompt",
    "transcript_from_context",
]
