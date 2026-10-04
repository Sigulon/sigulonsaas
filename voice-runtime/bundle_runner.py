# -*- coding: utf-8 -*-
"""Runtime bundle loader and node-graph execution engine for Sigulon voice worker.

Loads published Agent Bundle (bundle_version 2) and runs it as a conversational
state machine on LiveKit Agents:
- Starts with `first_response` with {{variable}} placeholders substituted from lead metadata.
- Sets active section prompt composed with business FAQs and global voice rules.
- Lets LLM evaluate transitions along edges; skips disabled sections.
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
    ) -> None:
        self.bundle = bundle
        self.lead_data = lead_data or {}
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
            text = re.sub(r"\{\{?\s*lead_name\s*\}?\}", str(lead_name).strip(), text, flags=re.IGNORECASE)
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
                text = re.sub(rf"\{{\{{?\s*{re.escape(key)}\s*\}}?\}}", str(val).strip(), text, flags=re.IGNORECASE)

        # Clean remaining unresolved braces
        text = re.sub(r"\{\{[^}]+\}\}", "", text).strip()
        return text

    def get_current_instructions(self) -> str:
        """Compose instructions for the active node in the graph."""
        if not self.current_section:
            return "You are a polite AI voice assistant. Speak concisely."

        node_prompt = self.current_section.get("prompt", "").strip()

        # Substitute known variables in node prompt
        all_known = {**self.lead_data, **self.extracted_variables}
        for k, v in all_known.items():
            if v:
                node_prompt = re.sub(rf"\{{\{{?\s*{re.escape(k)}\s*\}}?\}}", str(v).strip(), node_prompt, flags=re.IGNORECASE)

        # Append verified FAQs if available
        faq_text = ""
        if self.faq_section:
            raw_faq = self.faq_section.get("prompt", "").strip()
            faq_text = f"\n\nBUSINESS FAQS & VERIFIED KNOWLEDGE:\n{raw_faq}"

        rules = (
            "\n\nCRITICAL VOICE RULES:\n"
            "- Ask at most 1 short question at a time.\n"
            "- Keep every reply under 2 spoken sentences (max 30 words).\n"
            "- Warm, polite Telugu-English mix; keep words like enquiry, WhatsApp, loan in English.\n"
            "- Never read out URLs, JSON, curly braces, or markdown fences.\n"
            "- If the caller asks a business question, answer ONLY from the business FAQs above."
        )

        return f"ACTIVE GOAL:\n{node_prompt}{faq_text}{rules}"

    def evaluate_transition(self, user_utterance: str) -> Optional[dict[str, Any]]:
        """Evaluate edge conditions from current section to determine next section."""
        if not self.current_section:
            return None

        edges = self.current_section.get("edges")
        if not edges or not isinstance(edges, list):
            return None  # Terminal section

        user_text = user_utterance.lower().strip()

        # Check each edge condition
        for edge in edges:
            to_key = edge.get("to_key")
            condition = str(edge.get("condition") or "").lower()

            target_section = self.sections_by_key.get(to_key)
            if not target_section:
                continue  # Skip missing or disabled sections

            # Match negative / decline / close conditions
            if ("not interested" in condition or "decline" in condition or "wrong number" in condition or "close" in condition) and (
                "no" in user_text
                or "vaddu" in user_text
                or "not interested" in user_text
                or "busy" in user_text
                or "wrong" in user_text
            ):
                self.current_section = target_section
                log.info("[bundle_runner] transitioned to %s on negative condition: %s", to_key, condition)
                return self.current_section

            # Match question / faq condition
            if "faq" in to_key.lower() or "question" in condition:
                if "?" in user_text or "how" in user_text or "what" in user_text or "price" in user_text or "ekkada" in user_text or "enta" in user_text:
                    # Note: FAQs are in-context, so we don't necessarily leave the active node unless requested
                    pass

            # Standard forward transition
            if "once" in condition or "if" in condition or "after" in condition:
                # Normal forward progression on affirmative or meaningful input
                if len(user_text) > 2 and "no" not in user_text:
                    self.current_section = target_section
                    log.info("[bundle_runner] transitioned to %s on condition: %s", to_key, condition)
                    return self.current_section

        # If no explicit match but first edge exists, advance on affirmative
        first_edge = edges[0]
        target = self.sections_by_key.get(first_edge.get("to_key"))
        if target and len(user_text) > 1:
            self.current_section = target
            return self.current_section

        return None

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
