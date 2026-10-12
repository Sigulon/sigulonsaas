# -*- coding: utf-8 -*-
"""Runtime bundle loader and node-graph execution engine for Sigulon voice worker.

Loads published Agent Bundle (bundle_version 2) and runs it as a conversational
state machine on LiveKit Agents:
- Starts with `first_response` with {{variable}} placeholders substituted from lead metadata.
- Sets active section prompt composed with business FAQs and global voice rules.
- Exposes allowed edge conditions to the LLM and validates function-tool transitions.
- Extracts capture variables as the conversation proceeds.
- Saves captured variables into the call outcome / metadata.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

log = logging.getLogger("voice-runtime.bundle_runner")


class BundleRunner:
    """Manages conversational state machine for an Agent Bundle v2."""

    def __init__(
        self,
        bundle: dict[str, Any],
        lead_data: Optional[dict[str, Any]] = None,
        language: str = "te-IN",
        runtime_instructions: str = "",
    ) -> None:
        self.bundle = bundle
        # Dispatch payloads have appeared both as a flat map and as
        # {customerContext: {...}}.  Keep the wrapper available for metadata,
        # but flatten it for template resolution and capture prompts.
        supplied = lead_data or {}
        nested = supplied.get("customerContext") or supplied.get("customer_context")
        self.lead_data = {
            **(nested if isinstance(nested, dict) else {}),
            **{k: v for k, v in supplied.items() if k not in ("customerContext", "customer_context")},
        }
        self.runtime_instructions = runtime_instructions.strip()
        self.language = bundle.get("exported_from", {}).get("language") or language

        # Parse sections
        all_sections: list[dict[str, Any]] = bundle.get("sections") or []
        # Filter enabled sections only
        self.sections_by_key: dict[str, dict[str, Any]] = {
            s["section_key"]: s for s in all_sections if s.get("enabled", True)
        }
        self.ordered_sections: list[dict[str, Any]] = sorted(
            [s for s in all_sections if s.get("enabled", True)],
            key=lambda x: int(x.get("order", 0)),
        )

        # Separate business FAQs section
        self.faq_section: Optional[dict[str, Any]] = self.sections_by_key.get("faqs")

        # Entry section is the lowest order among non-faq sections
        non_faq_sections = [s for s in self.ordered_sections if s.get("section_key") != "faqs"]
        self.entry_section: Optional[dict[str, Any]] = (
            non_faq_sections[0] if non_faq_sections else (self.ordered_sections[0] if self.ordered_sections else None)
        )
        self.current_section: Optional[dict[str, Any]] = self.entry_section

        # Variables definition
        self.variables: list[dict[str, Any]] = bundle.get("variables") or []
        self.capture_vars: list[dict[str, Any]] = [
            v for v in self.variables if v.get("source") == "capture"
        ]

        # In-flight extracted capture variables
        self.extracted_variables: dict[str, Any] = {}

    def resolve_greeting(self) -> str:
        """Resolve variables in first_response using lead_data."""
        text = str(self.bundle.get("first_response") or "").strip()
        if not text:
            return "హలో అండి, నమస్తే!" if "te" in self.language else "Hello!"

        lead_name = (
            self.lead_data.get("lead_name")
            or self.lead_data.get("name")
            or self.lead_data.get("customer_name")
            or ""
        )

        if lead_name:
            text = re.sub(r"\{\{?\s*lead_name\s*\}?\}", lambda _: str(lead_name).strip(), text, flags=re.IGNORECASE)
        else:
            # Smoothly remove the asking tag if name is unknown
            text = re.sub(
                r",?\s*\{\{?\s*lead_name\s*\}?\}\s*(?:తో|గారితో)?\s*మాట్లాడుతున్నానా\s*\??",
                "!",
                text,
                flags=re.IGNORECASE,
            )
            text = re.sub(r"\{\{?\s*lead_name\s*\}?\}", "", text, flags=re.IGNORECASE)

        # Substitute any other pre-call variables
        for key, val in self.lead_data.items():
            if val is not None:
                text = re.sub(rf"\{{\{{?\s*{re.escape(str(key))}\s*\}}?\}}", lambda _: str(val).strip(), text, flags=re.IGNORECASE)

        # Clean remaining unresolved braces
        text = re.sub(r"\{\{[^}]+\}\}", "", text).strip()
        return text

    def get_current_instructions(self) -> str:
        """Compose instructions for the active node in the graph."""
        if not self.current_section:
            return self.runtime_instructions or "You are a polite AI voice assistant. Speak concisely."

        node_prompt = self.current_section.get("prompt", "").strip()

        # Substitute known variables in node prompt
        all_known = {**self.lead_data, **self.extracted_variables}
        for k, v in all_known.items():
            if v is not None:
                node_prompt = re.sub(rf"\{{\{{?\s*{re.escape(str(k))}\s*\}}?\}}", lambda _: str(v).strip(), node_prompt, flags=re.IGNORECASE)

        # Append verified FAQs if available
        faq_text = ""
        if self.faq_section:
            raw_faq = self.faq_section.get("prompt", "").strip()
            faq_text = f"\n\nBUSINESS FAQS & VERIFIED KNOWLEDGE:\n{raw_faq}"

        rules = (
            "\n\nCRITICAL VOICE RULES:\n"
            "- Ask at most 1 short question at a time.\n"
            "- Keep every reply under 2 spoken sentences (max 30 words).\n"
            "- Follow the runtime language instructions; stay warm and polite.\n"
            "- Never read out URLs, JSON, curly braces, or markdown fences.\n"
            "- If the caller asks a business question, answer ONLY from the business FAQs above."
        )

        routes = json.dumps(self.allowed_transitions(), ensure_ascii=False)
        key = self.current_section["section_key"]
        routing = (
            f"\n\nCURRENT SECTION: {key}\nALLOWED TRANSITIONS: {routes}\n"
            "Evaluate these conditions against the conversation, including captured details. "
            "When a condition is satisfied, call transition_bundle with this source section "
            "and its allowed target BEFORE speaking the next goal. Never invent a target. "
            "If uncertain, remain here and clarify. FAQs are contextual knowledge: answer "
            "questions without changing section, then resume the current goal."
        )
        bundle_instructions = f"ACTIVE GOAL:\n{node_prompt}{faq_text}{rules}{routing}"
        return f"{self.runtime_instructions}\n\n{bundle_instructions}" if self.runtime_instructions else bundle_instructions

    def allowed_transitions(self) -> list[dict[str, str]]:
        """Only enabled graph neighbours are executable; FAQs never consume state."""
        return [
            {"to_key": edge["to_key"], "condition": str(edge.get("condition") or "")}
            for edge in (self.current_section or {}).get("edges") or []
            if isinstance(edge, dict) and edge.get("to_key") in self.sections_by_key
            and edge["to_key"] != "faqs" and edge.get("condition")
        ]

    def transition(self, source_key: str, target_key: str) -> None:
        """Validate the LLM's requested edge; reject stale or arbitrary calls."""
        if not self.current_section or self.current_section["section_key"] != source_key:
            raise ValueError("Stale source section; consult current instructions.")
        if target_key not in {edge["to_key"] for edge in self.allowed_transitions()}:
            raise ValueError("Target is not an enabled outgoing transition; FAQs stay contextual.")
        self.current_section = self.sections_by_key[target_key]

    def create_transition_tool(self, update_instructions):
        from livekit.agents import function_tool, ToolError
        import asyncio

        lock = asyncio.Lock()

        @function_tool
        async def transition_bundle(source_key: str, target_key: str) -> str:
            """Advance via an allowed edge only when its stated condition is satisfied.

            Args:
                source_key: Current section key from the instructions.
                target_key: Allowed target whose condition the conversation satisfies.
            """
            async with lock:
                previous = self.current_section
                try:
                    self.transition(source_key, target_key)
                except ValueError as exc:
                    raise ToolError(str(exc)) from exc
                try:
                    await update_instructions(self.get_current_instructions())
                except BaseException:
                    self.current_section = previous
                    raise
                return self.get_current_instructions()

        return transition_bundle

    def extract_variables_from_turn(self, user_utterance: str) -> None:
        """Extract capture variables mentioned in caller utterance."""
        text = user_utterance.strip()
        if not text:
            return

        for var_def in self.capture_vars:
            key = var_def.get("key", "")
            if key in self.extracted_variables:
                continue  # Already captured

            # Check budget
            if "budget" in key or "price" in key:
                match = re.search(r"(\d+[\s,]*(?:lakh|crore|cr|k|thousand|rupees|₹)?|\d+)", text, re.IGNORECASE)
                if match:
                    self.extracted_variables[key] = match.group(0).strip()
                    log.info("[bundle_runner] extracted %s: %s", key, self.extracted_variables[key])

            # Check date / time / appointment
            elif "date" in key or "time" in key or "visit" in key:
                if any(w in text.lower() for w in ("sunday", "saturday", "tomorrow", "repu", "morning", "evening", "11", "pm", "am")):
                    self.extracted_variables[key] = text[:60]
                    log.info("[bundle_runner] extracted %s: %s", key, self.extracted_variables[key])

            # Check choice
            elif var_def.get("value_type") == "choice" and var_def.get("choices"):
                for choice in var_def["choices"]:
                    if str(choice).lower() in text.lower():
                        self.extracted_variables[key] = choice
                        log.info("[bundle_runner] extracted %s: %s", key, choice)
                        break

            # General capture
            elif self.current_section and f"qualify_{key}" in self.current_section.get("section_key", ""):
                self.extracted_variables[key] = text[:80]
                log.info("[bundle_runner] extracted %s: %s", key, self.extracted_variables[key])

    def get_captured_variables(self) -> dict[str, Any]:
        """Return all extracted variables for call outcome."""
        return {**self.extracted_variables}
