"""Dynamic business tools / webhooks registration per tenant.

Enables each tenant to register custom tools (HTTP webhooks, external APIs)
defined in their agent configuration (MongoDB agent.config.tools.customTools).
Tools are dynamically registered at session start as LiveKit function_tools
with their JSON schemas, fully isolated to the tenant's session.
"""

from __future__ import annotations

import logging
from typing import Any, Callable
import httpx
from livekit.agents import RunContext, function_tool

log = logging.getLogger("voice-runtime.tools.custom")


def create_dynamic_tool(
    spec: dict[str, Any],
    tenant_id: str,
    call_id: str,
) -> Any:
    """Create a LiveKit function_tool with raw_schema for a tenant's custom tool."""
    name = str(spec.get("name", "")).strip()
    if not name:
        raise ValueError("Custom tool must have a non-empty name.")

    description = str(spec.get("description", f"Custom tool {name}")).strip()
    parameters = spec.get("parameters") or {"type": "object", "properties": {}}

    raw_schema = {
        "name": name,
        "description": description,
        "parameters": parameters,
    }

    url = spec.get("url") or spec.get("webhook_url") or ""
    method = str(spec.get("method", "POST")).upper()
    headers = dict(spec.get("headers") or {})
    # Strict tenant isolation headers
    headers["X-Tenant-Id"] = tenant_id
    headers["X-Call-Id"] = call_id
    headers.setdefault("Content-Type", "application/json")

    timeout_seconds = float(spec.get("timeout_seconds", 8.0))

    async def _handler(context: RunContext, **kwargs: Any) -> Any:
        if not url:
            return {"error": f"Tool '{name}' has no endpoint URL configured."}

        log.info(
            "[custom_tool] invoking %s for tenant=%s call=%s",
            name, tenant_id, call_id
        )

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                if method == "GET":
                    resp = await client.get(url, params=kwargs, headers=headers)
                else:
                    payload = {
                        "arguments": kwargs,
                        "tenant_id": tenant_id,
                        "call_id": call_id,
                    }
                    resp = await client.post(url, json=payload, headers=headers)

                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")
                if "application/json" in content_type:
                    return resp.json()
                return resp.text[:2000]
        except httpx.TimeoutException:
            log.warning("[custom_tool] timeout invoking %s", name)
            return {"error": f"Operation timed out while executing {name}."}
        except httpx.HTTPStatusError as exc:
            log.warning("[custom_tool] HTTP %d from %s", exc.response.status_code, name)
            return {"error": f"Tool {name} returned error status {exc.response.status_code}."}
        except Exception as exc:  # noqa: BLE001 - never crash voice pipeline
            log.exception("[custom_tool] error executing %s", name)
            return {"error": f"Failed to execute {name}: {str(exc)}"}

    return function_tool(raw_schema=raw_schema)(_handler)


def build_custom_tools(
    tool_specs: list[dict[str, Any]] | None,
    tenant_id: str,
    call_id: str,
) -> list[Any]:
    """Dynamically construct LiveKit function tools from tenant custom tool definitions."""
    tools: list[Any] = []
    for spec in tool_specs or []:
        if not isinstance(spec, dict) or not spec.get("name"):
            continue
        try:
            tool = create_dynamic_tool(spec, tenant_id=tenant_id, call_id=call_id)
            tools.append(tool)
            log.info("[custom_tool] registered tool %s for tenant=%s", spec["name"], tenant_id)
        except Exception as exc:  # noqa: BLE001
            log.error("[custom_tool] failed to register tool %r: %s", spec.get("name"), exc)
    return tools
