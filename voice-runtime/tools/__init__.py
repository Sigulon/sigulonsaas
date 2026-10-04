"""Function-calling tools available to voice agents (LiveKit function_tool).

Each tool module exposes a LiveKit ``@function_tool`` (name + docstring +
typed args) plus a ``*_SPEC`` dict and ``*_handler`` for unit tests. Agent
sessions advertise only the tools named in ``AgentConfig.enabled_tools`` —
adding a new tool means:

1. Create ``tools/<name>.py`` with a ``@function_tool`` + SPEC + impl (see
   :mod:`tools.book_appointment`).
2. Register it in :data:`TOOL_REGISTRY` below.
3. Add its name to the agent's ``config.tools.enabledTools`` in MongoDB.

All five tools are backed by org data (appointments, contacts, agent
settings) or live SIP transfer — no mocks, no static catalogs. Unknown names
in ``enabled_tools`` warn-and-skip at session build, so a typo degrades to
fewer tools, never a broken call. Tool callbacks stay org-scoped via
session userdata (runtime-stream-auth on the control API side).
"""

from __future__ import annotations

import logging
from typing import Any

from tools.availability import CHECK_AVAILABILITY_SPEC, check_availability
from tools.book_appointment import BOOK_APPOINTMENT_SPEC, book_appointment
from tools.leads import CREATE_LEAD_SPEC, create_lead
from tools.pricing import PRICING_LOOKUP_SPEC, pricing_lookup
from tools.transfer import TRANSFER_CALL_SPEC, transfer_call

log = logging.getLogger("voice-runtime.tools")

TOOL_REGISTRY: dict[str, Any] = {
    "check_availability": check_availability,
    "book_appointment": book_appointment,
    "pricing_lookup": pricing_lookup,
    "create_lead": create_lead,
    "transfer_call": transfer_call,
}

TOOL_SPECS: dict[str, dict[str, Any]] = {
    "check_availability": CHECK_AVAILABILITY_SPEC,
    "book_appointment": BOOK_APPOINTMENT_SPEC,
    "pricing_lookup": PRICING_LOOKUP_SPEC,
    "create_lead": CREATE_LEAD_SPEC,
    "transfer_call": TRANSFER_CALL_SPEC,
}


def build_tools(enabled: list[str] | None) -> list[Any]:
    """Resolve enabled capability names to LiveKit function_tools."""
    tools: list[Any] = []
    for name in enabled or []:
        tool = TOOL_REGISTRY.get(name)
        if tool is None:
            log.warning("[tools] unknown enabled tool %r — skipping", name)
            continue
        tools.append(tool)
    return tools


# Back-compat aliases for ported tests importing the old legacy-rtc schema names.
BOOK_APPOINTMENT_SCHEMA = BOOK_APPOINTMENT_SPEC
CHECK_AVAILABILITY_SCHEMA = CHECK_AVAILABILITY_SPEC
CREATE_LEAD_SCHEMA = CREATE_LEAD_SPEC
PRICING_LOOKUP_SCHEMA = PRICING_LOOKUP_SPEC
TRANSFER_CALL_SCHEMA = TRANSFER_CALL_SPEC

__all__ = [
    "BOOK_APPOINTMENT_SCHEMA",
    "BOOK_APPOINTMENT_SPEC",
    "CHECK_AVAILABILITY_SCHEMA",
    "CHECK_AVAILABILITY_SPEC",
    "CREATE_LEAD_SCHEMA",
    "CREATE_LEAD_SPEC",
    "PRICING_LOOKUP_SCHEMA",
    "PRICING_LOOKUP_SPEC",
    "TOOL_REGISTRY",
    "TOOL_SPECS",
    "TRANSFER_CALL_SCHEMA",
    "TRANSFER_CALL_SPEC",
    "build_tools",
]
