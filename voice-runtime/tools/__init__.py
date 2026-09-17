"""Function-calling tools available to voice agents.

Each tool module exposes a Pipecat ``FunctionSchema`` (name + JSON-schema
properties bundled with its handler). :mod:`pipeline` advertises only the
schemas named in ``AgentConfig.enabled_tools`` — adding a new tool means:

1. Create ``tools/<name>.py`` with a ``SCHEMA`` and handler (see
   :mod:`tools.book_appointment`).
2. Register it in :data:`TOOL_REGISTRY` below.
3. Add its name to the agent's ``config.tools.enabledTools`` in MongoDB.

All five tools are backed by org data (appointments, contacts, agent
settings) or live telephony — no mocks, no static catalogs. Unknown names
in ``enabled_tools`` warn-and-skip at pipeline build, so a typo degrades to
fewer tools, never a broken call.
"""

from tools.availability import CHECK_AVAILABILITY_SCHEMA
from tools.book_appointment import BOOK_APPOINTMENT_SCHEMA
from tools.leads import CREATE_LEAD_SCHEMA
from tools.pricing import PRICING_LOOKUP_SCHEMA
from tools.transfer import TRANSFER_CALL_SCHEMA

TOOL_REGISTRY: dict[str, object] = {
    "check_availability": CHECK_AVAILABILITY_SCHEMA,
    "book_appointment": BOOK_APPOINTMENT_SCHEMA,
    "pricing_lookup": PRICING_LOOKUP_SCHEMA,
    "create_lead": CREATE_LEAD_SCHEMA,
    "transfer_call": TRANSFER_CALL_SCHEMA,
}

__all__ = [
    "TOOL_REGISTRY",
    "BOOK_APPOINTMENT_SCHEMA",
    "CHECK_AVAILABILITY_SCHEMA",
    "CREATE_LEAD_SCHEMA",
    "PRICING_LOOKUP_SCHEMA",
    "TRANSFER_CALL_SCHEMA",
]
