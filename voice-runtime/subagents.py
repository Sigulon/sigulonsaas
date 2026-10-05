"""Multi-subagent orchestration and dynamic handoffs for Sigulon voice runtime.

Supports runtime subagents and handoffs:
- Tenants can define specialized subagents (e.g., Booking Specialist, Support Engineer, Billing Agent).
- Handoff tool dynamically registered for the LLM to invoke when caller intent shifts.
- Switches active agent via `session.update_agent(new_agent)` with chat context preserved.
- Records handoff transitions in call transcript and telemetry.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Callable, Optional
from livekit.agents import Agent, RunContext, function_tool
from voice_stack import build_tts

log = logging.getLogger("voice-runtime.subagents")


class SubAgentSpec:
    """Specification of a tenant subagent / specialist."""

    def __init__(
        self,
        subagent_id: str,
        name: str,
        description: str,
        instructions: str,
        voice_id: Optional[str] = None,
        voice_speed: float = 1.0,
        enabled_tools: Optional[list[str]] = None,
        custom_tools: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        self.subagent_id = subagent_id
        self.name = name
        self.description = description
        self.instructions = instructions
        self.voice_id = voice_id
        self.voice_speed = voice_speed
        self.enabled_tools = enabled_tools or []
        self.custom_tools = custom_tools or []


class SubAgentRegistry:
    """Manages subagent instances and handoffs for an active session."""

    def __init__(
        self,
        tenant_id: str,
        call_id: str,
        language: str = "en",
        main_voice_id: str = "",
        main_voice_speed: float = 1.0,
    ) -> None:
        self.tenant_id = tenant_id
        self.call_id = call_id
        self.language = language
        self.main_voice_id = main_voice_id
        self.main_voice_speed = main_voice_speed
        self.specs: dict[str, SubAgentSpec] = {}
        self.agent_instances: dict[str, Agent] = {}
        self.current_agent_id: str = "main"

    def register_spec(self, spec: SubAgentSpec) -> None:
        """Register a subagent specification."""
        self.specs[spec.subagent_id] = spec
        log.info(
            "[subagents] registered subagent '%s' (%s) for tenant=%s",
            spec.subagent_id, spec.name, self.tenant_id
        )

    def load_from_config(self, subagents_config: list[dict[str, Any]] | None) -> None:
        """Parse subagent definitions from tenant config."""
        for item in subagents_config or []:
            if not isinstance(item, dict):
                continue
            s_id = str(item.get("id") or item.get("subagent_id") or item.get("name") or "").strip().lower()
            if not s_id:
                continue
            name = str(item.get("name") or s_id).strip()
            desc = str(item.get("description") or f"Specialist handling {name}").strip()
            instructions = str(item.get("instructions") or item.get("system_prompt") or "").strip()
            voice_id = item.get("voice_id") or item.get("voiceId") or None
            speed = float(item.get("voice_speed") or item.get("speed") or 1.0)
            enabled_tools = list(item.get("tools") or item.get("enabled_tools") or [])
            custom_tools = list(item.get("custom_tools") or [])

            spec = SubAgentSpec(
                subagent_id=s_id,
                name=name,
                description=desc,
                instructions=instructions,
                voice_id=voice_id,
                voice_speed=speed,
                enabled_tools=enabled_tools,
                custom_tools=custom_tools,
            )
            self.register_spec(spec)

    def get_descriptions(self) -> str:
        """Return formatted descriptions of available subagents for the LLM tool."""
        lines = []
        for s_id, s in self.specs.items():
            lines.append(f"- '{s_id}' ({s.name}): {s.description}")
        return "\n".join(lines)

    def build_agent(
        self,
        subagent_id: str,
        tool_resolver: Callable[[list[str], list[dict[str, Any]]], list[Any]],
    ) -> Optional[Agent]:
        """Instantiate a LiveKit Agent for the specified subagent."""
        if subagent_id in self.agent_instances:
            return self.agent_instances[subagent_id]

        spec = self.specs.get(subagent_id)
        if not spec:
            return None

        tools = tool_resolver(spec.enabled_tools, spec.custom_tools)
        tts = None
        if spec.voice_id and spec.voice_id != self.main_voice_id:
            try:
                tts = build_tts(
                    voice_id=spec.voice_id,
                    language=self.language,
                    speed=spec.voice_speed,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("[subagents] failed to build custom voice for %s: %s", subagent_id, exc)

        agent = Agent(
            instructions=spec.instructions,
            tools=tools,
            tts=tts,  # type: ignore[arg-type]
        )
        self.agent_instances[subagent_id] = agent
        return agent


def create_handoff_tool(
    registry: SubAgentRegistry,
    tool_resolver: Callable[[list[str], list[dict[str, Any]]], list[Any]],
    transcript_events: list[dict[str, Any]],
) -> Optional[Any]:
    """Create a LiveKit function_tool for handing off to subagents."""
    if not registry.specs:
        return None

    descriptions = registry.get_descriptions()

    @function_tool()
    async def handoff_to_specialist(
        context: RunContext,
        specialist_id: Annotated[str, f"Target specialist subagent ID. Available options:\n{descriptions}"],
        reason: Annotated[str, "The specific reason why caller is being transferred to this specialist."],
    ) -> str:
        """Transfer the call to a specialized department or subagent."""
        target_id = specialist_id.strip().lower()
        if target_id not in registry.specs:
            avail = ", ".join(registry.specs.keys())
            return f"Specialist '{target_id}' not found. Available specialists: {avail}."

        target_spec = registry.specs[target_id]
        session = getattr(context, "_session", None)
        if session is None:
            return f"Unable to hand off to {target_spec.name}: session context unavailable."

        target_agent = registry.build_agent(target_id, tool_resolver)
        if target_agent is None:
            return f"Failed to instantiate specialist {target_spec.name}."

        log.info(
            "[subagents] handoff from '%s' to '%s' reason=%s call=%s tenant=%s",
            registry.current_agent_id, target_id, reason, registry.call_id, registry.tenant_id
        )

        # Update active agent on LiveKit session
        session.update_agent(target_agent)
        registry.current_agent_id = target_id

        # Record handoff in transcript
        transcript_events.append({
            "role": "system",
            "text": f"[Agent Handoff: Transferred to {target_spec.name}. Reason: {reason}]",
        })

        return (
            f"You have been successfully transferred to {target_spec.name}. "
            f"Introduce yourself as {target_spec.name} and address the caller's request regarding {reason}."
        )

    return handoff_to_specialist
