# -*- coding: utf-8 -*-
"""Per-call agent configuration for the Sigulon voice runtime.

Configuration flow per call
----------------------------
1. ``load_agent_config(call_id)`` first checks Redis
   (``sigulon:call:{call_id}:config``, JSON, short TTL). The Next.js control
   plane is expected to pre-warm this key when it creates the call record and
   generates the Plivo ``<Stream>`` answer XML.
2. On a cache miss it queries MongoDB (the source of truth):
   ``calls`` -> ``agents`` (+ ``organizations`` for the concurrency limit).

Nothing tenant-specific is hardcoded here: prompts, voice IDs, languages,
tool sets and limits all flow through :class:`AgentConfig`.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from typing import Any, Literal, Optional
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, model_validator

from language import CARTESIA_TTS_MODEL

log = logging.getLogger("voice-runtime.config")

# ---------------------------------------------------------------------------
# Template variable resolution (clean greetings before Cartesia TTS)
# ---------------------------------------------------------------------------

_DEFAULT_GREETINGS: dict[str, str] = {
    "te": "నమస్తే అండి!",
    "hi": "नमस्ते!",
    "ta": "வணக்கம்!",
    "kn": "ನಮಸ್ಕಾರ!",
    "ml": "നമസ്കാരം!",
    "mr": "नमस्कार!",
    "bn": "নমস্কার!",
    "gu": "નમસ્તે!",
    "pa": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ!",
    "en": "Hello!",
}


def resolve_introduction(
    raw_intro: Optional[str],
    lead_name: Optional[str] = None,
    language: str = "en",
) -> Optional[str]:
    """Resolve greeting template variables (e.g. {{lead_name}}) before TTS.

    If lead_name is provided, replaces all {{lead_name}} and {lead_name} placeholders.
    If lead_name is missing, smoothly adapts or strips the asking phrase so that
    no placeholder braces or unresolved tokens ever reach Cartesia TTS.
    """
    if not raw_intro or not raw_intro.strip():
        return None

    text = raw_intro.strip()
    name = (lead_name or "").strip()

    if name:
        # Replace lead name variables (with single or double braces)
        text = re.sub(
            r"\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}",
            name,
            text,
            flags=re.IGNORECASE,
        )
    else:
        # Smoothly strip lead-name asking phrases when lead name is unknown
        text = re.sub(
            r",?\s*\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*గారితో\s+మాట్లాడుతున్నానా\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*क्या\s+मैं\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*(?:जी)?\s*से\s+बात\s+कर\s+रहा/रही\s+हूँ\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*நான்\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*அவர்களுடன்\s+பேசுகிறேனா\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*ನಾನು\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*ಅವರೊಂದಿಗೆ\s+ಮಾತನಾಡುತ್ತಿದ್ದೇನೆಯೇ\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*ഞാൻ\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*-?നോടാണോ\s+സംസാരിക്കുന്നത്\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*मी\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*यांच्याशी\s+बोलत\s+आहे\s+का\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*আমি\s+কি\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*-?এর\s+সঙ্গে\s+কথা\s+বলছি\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*શું\s+હું\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*સાથે\s+વાત\s+કરી\s+રહ્યો/રહી\s+છું\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*ਕੀ\s+ਮੈਂ\s+\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*(?:ਜੀ)?\s*ਨਾਲ\s+ਗੱਲ\s+ਕਰ\s+ਰਿਹਾ/ਰਹੀ\s+ਹਾਂ\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r",?\s*(?:am\s+I\s+speaking\s+with|is\s+this|may\s+I\s+speak\s+(?:to|with))\s*\{\{?\s*(?:lead_name|customer_name|name)\s*\}?\}\s*\??",
            "!",
            text,
            flags=re.IGNORECASE,
        )

    # Strip any residual curly-brace template variables or raw braces
    text = re.sub(r"\{\{[^}]*\}\}|\{[^}]*\}", "", text)
    text = re.sub(r"[{}]", "", text)

    # Clean up whitespace and punctuation
    text = re.sub(r"\s+([,?.!])", r"\1", text)
    text = re.sub(r"[,\s]+$", "!", text)
    text = re.sub(r"!\s*!", "!", text)
    text = re.sub(r"\s+", " ", text).strip()

    # If stripped to empty or punctuation only, use language default
    if not text or re.match(r"^[,?.!—\s]+$", text):
        base_lang = (language or "en").split("-")[0].lower()
        return _DEFAULT_GREETINGS.get(base_lang, "Hello!")

    return text


# ---------------------------------------------------------------------------
# Redis key layout
# ---------------------------------------------------------------------------

CALL_CONFIG_KEY = "sigulon:call:{call_id}:config"
TENANT_ACTIVE_CALLS_KEY = "sigulon:tenant:{tenant_id}:active_calls"

CALL_CONFIG_TTL_SECS = int(os.getenv("CALL_CONFIG_TTL_SECS", "3600"))
ACTIVE_CALLS_KEY_TTL_SECS = int(os.getenv("ACTIVE_CALLS_KEY_TTL_SECS", "7200"))

_redis_client: Optional[Any] = None  # redis.asyncio.Redis, imported lazily
_mongo_client: Optional[Any] = None
_mongo_client_lock = threading.Lock()
_local_config_cache: dict[str, Any] = {}
_local_tenant_slots: dict[str, int] = {}


class RedisConfigurationError(RuntimeError):
    """Redis is missing or unavailable for an operation that requires it."""


class ConcurrencyStateUnavailable(RuntimeError):
    """The distributed concurrency counter cannot be safely updated."""


def get_redis() -> Any:
    """Return a shared async Redis client (created on first use)."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as redis
            from redis.asyncio.retry import Retry
            from redis.backoff import NoBackoff
        except ImportError as exc:  # pragma: no cover - deploy config error
            raise RuntimeError(
                "The 'redis' package is required (pip install redis). "
                "Set REDIS_URL, e.g. redis://localhost:6379/0."
            ) from exc
        redis_url = os.getenv("REDIS_URL", "").strip()
        if not redis_url:
            raise RedisConfigurationError(
                "REDIS_URL is not configured; refusing an implicit localhost Redis connection."
            )
        parsed = urlsplit(redis_url)
        log.info(
            "[redis] connecting host=%s port=%s tls=%s",
            parsed.hostname or "unknown",
            parsed.port or (6380 if parsed.scheme == "rediss" else 6379),
            parsed.scheme == "rediss",
        )
        _redis_client = redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            # Redis is an optimisation, not part of the audio critical path.
            # Fail quickly when a local/dev Redis service is absent instead of
            # spending several seconds on every config/session operation.
            socket_connect_timeout=float(os.getenv("REDIS_CONNECT_TIMEOUT_SECS", "0.35")),
            socket_timeout=float(os.getenv("REDIS_SOCKET_TIMEOUT_SECS", "0.5")),
            health_check_interval=30,
            retry=Retry(NoBackoff(), 0),
        )
    return _redis_client


async def close_redis() -> None:
    """Close the shared Redis client (call on app shutdown)."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception as exc:  # noqa: BLE001 - best-effort shutdown
            log.warning("Error closing Redis client: %s", exc)
        _redis_client = None


# ---------------------------------------------------------------------------
# Typed per-call configuration
# ---------------------------------------------------------------------------


class AgentConfig(BaseModel):
    """Everything the pipeline needs to run one call. No tenant hardcoding."""

    # Identity / tenancy
    call_id: str = Field(description="Sigulon calls.id (also the Plivo WS path id)")
    agent_id: str = Field(description="Sigulon agents.id handling the call")
    tenant_id: str = Field(description="Sigulon organizations.id owning the agent")
    direction: Literal["inbound", "outbound"] = "inbound"
    from_number: Optional[str] = None
    to_number: Optional[str] = None

    # Conversation behaviour
    system_prompt: str = Field(
        default="You are a helpful AI voice assistant.",
        description="Pre-generated system prompt from the control plane.",
    )
    introduction: Optional[str] = Field(
        default=None,
        description="Greeting spoken first. None/empty on outbound = wait for callee.",
    )

    # Fixed speech stack: Cartesia STT and Cartesia Sonic 3 TTS.
    language: str = Field(
        default="en",
        description="BCP-47 / ISO-639-1 speech language, e.g. 'en', 'hi', 'te'.",
    )
    stt_provider: str = Field(
        default="cartesia",
        description="STT vendor (Cartesia).",
    )
    stt_model: Optional[str] = Field(
        default=None,
        description="STT model id. None = factory default for the provider/language.",
    )
    tts_model: str = Field(default=CARTESIA_TTS_MODEL, description="Cartesia TTS model id.")
    tts_provider: str = Field(
        default="cartesia",
        description="TTS vendor. Only 'cartesia' is implemented; others fail fast.",
    )
    voice_id: str = Field(description="Cartesia voice UUID for TTS output.")
    voice_speed: float = Field(
        default=1.0, description="TTS speed multiplier (Cartesia range 0.6-1.5)."
    )
    llm_provider: str = Field(
        default="openrouter",
        description="LLM vendor (OpenRouter).",
    )
    llm_model: str = Field(
        default="google/gemini-2.5-flash",
        description="LLM model id.",
    )

    # Prompt context (informational: system_prompt is pre-generated server-side
    # by the canonical prompt builder; goals/rules travel for observability).
    goals: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)

    # Tools enabled for this agent (subset of the registry in voice-runtime/tools/).
    enabled_tools: list[str] = Field(default_factory=list)

    # Plan / safety limits
    max_concurrent_calls: int = Field(
        default=5, description="Per-tenant concurrent-call limit (plan-gated)."
    )
    max_call_seconds: int = Field(
        default=1800, description="Hard cap on call duration (cost guard)."
    )
    silence_timeout_seconds: int = Field(
        default=20, description="Silence endpointing hint for turn-taking."
    )
    record_calls: bool = Field(default=True)
    bundle: Optional[dict[str, Any]] = Field(default=None, description="Standardized Agent Bundle v2")

    # Optional per-call BYOK overrides (decrypted by the control plane before
    # caching in Redis). None = fall back to the service-wide env vars.
    cartesia_api_key: Optional[str] = Field(default=None)
    openrouter_api_key: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def normalize_voice_stack(self) -> "AgentConfig":
        """Keep cached and legacy agent records on the supported voice stack."""
        self.llm_provider = "openrouter"
        self.llm_model = "google/gemini-2.5-flash"
        self.stt_provider = "cartesia"
        self.stt_model = None
        self.tts_provider = "cartesia"
        self.tts_model = CARTESIA_TTS_MODEL
        if self.introduction:
            self.introduction = resolve_introduction(
                self.introduction, lead_name=None, language=self.language
            )
        return self

    def to_canonical(self) -> dict[str, Any]:
        """Export the spec section 7 canonical shape (mirrors TS `toCanonicalAgentConfig`).

        This is the documented Redis cache payload both sides agree on.
        Secrets (BYOK overrides) are deliberately excluded.
        """
        return {
            "id": self.agent_id,
            "organization_id": self.tenant_id,
            "call_id": self.call_id,
            "direction": self.direction,
            "identity": {"name": "", "company": ""},
            "instructions": {
                "system_prompt": self.system_prompt,
                "introduction": self.introduction,
                "goals": list(self.goals),
                "rules": list(self.rules),
            },
            "voice": {
                "provider": "cartesia",
                "voice_id": self.voice_id,
                "language": self.language,
                "speed": self.voice_speed,
            },
            "intelligence": {
                "provider": self.llm_provider,
                "model": self.llm_model,
            },
            "speech": {
                "stt_provider": self.stt_provider,
                "stt_model": self.stt_model,
                "tts_provider": self.tts_provider,
                "tts_model": self.tts_model,
            },
            "telephony": {"provider": "plivo", "phone_number_id": None},
            "tools": list(self.enabled_tools),
            "settings": {
                "max_call_duration_seconds": self.max_call_seconds,
                "silence_timeout_seconds": self.silence_timeout_seconds,
                "record_calls": self.record_calls,
            },
            "bundle": self.bundle,
        }

    @classmethod
    def from_canonical(cls, data: dict[str, Any]) -> "AgentConfig":
        """Parse the canonical shape back (web pre-warm payloads, Phase 5)."""
        instructions = data.get("instructions", {})
        voice = data.get("voice", {})
        intelligence = data.get("intelligence", {})
        speech = data.get("speech", {})
        settings = data.get("settings", {})
        return cls(
            call_id=data.get("call_id", ""),
            agent_id=data.get("id", ""),
            tenant_id=data.get("organization_id", ""),
            direction=data.get("direction", "inbound"),
            system_prompt=instructions.get("system_prompt")
            or cls.model_fields["system_prompt"].default,
            introduction=resolve_introduction(
                instructions.get("introduction"),
                lead_name=data.get("lead_name"),
                language=voice.get("language", "en"),
            ),
            goals=list(instructions.get("goals", [])),
            rules=list(instructions.get("rules", [])),
            language=voice.get("language", "en"),
            voice_id=voice.get("voice_id", ""),
            voice_speed=float(voice.get("speed", 1.0)),
            llm_provider=intelligence.get("provider", "openrouter"),
            llm_model=intelligence.get("model", "google/gemini-2.5-flash"),
            stt_provider="cartesia",
            stt_model=None,
            tts_provider="cartesia",
            tts_model=CARTESIA_TTS_MODEL,
            enabled_tools=list(data.get("tools", [])),
            max_call_seconds=int(
                settings.get("max_call_duration_seconds", 1800)),
            silence_timeout_seconds=int(
                settings.get("silence_timeout_seconds", 20)),
            record_calls=bool(settings.get("record_calls", True)),
            bundle=data.get("bundle") if isinstance(data.get("bundle"), dict) else None,
        )


# ---------------------------------------------------------------------------
# Loading: Redis cache -> MongoDB source of truth
# ---------------------------------------------------------------------------


async def load_agent_config(
    call_id: str,
) -> AgentConfig:
    """Load the :class:`AgentConfig` for a call.

    Checks in-memory cache first, then Redis, then MongoDB source of truth.

    Raises:
        ConfigNotFoundError: if no config exists in any store.
    """
    if call_id in _local_config_cache:
        log.info("Agent config local memory hit for call %s", call_id)
        return _local_config_cache[call_id]
    cached = None
    try:
        redis_client = get_redis()
        cached = await redis_client.get(CALL_CONFIG_KEY.format(call_id=call_id))
    except Exception as exc:  # noqa: BLE001 - cache must never break calls
        log.warning("[redis] config lookup unavailable for call %s: %s", call_id, exc)

    if cached:
        log.info("Agent config cache hit for call %s", call_id)
        payload = json.loads(cached)
        # Canonical shape (web pre-warm) vs legacy flat shape (back-compat).
        if "organization_id" in payload:
            cfg = AgentConfig.from_canonical(payload)
        else:
            cfg = AgentConfig.model_validate(payload)
        _local_config_cache[call_id] = cfg
        return cfg

    log.info("Agent config cache miss for call %s, querying MongoDB", call_id)
    config = await _load_agent_config_from_mongodb(call_id)
    _local_config_cache[call_id] = config

    try:
        await get_redis().set(
            CALL_CONFIG_KEY.format(call_id=call_id),
            config.model_dump_json(),
            ex=CALL_CONFIG_TTL_SECS,
        )
    except Exception as exc:  # noqa: BLE001 - cache write is best-effort
        log.warning("[redis] config cache write unavailable for call %s: %s", call_id, exc)

    return config


class ConfigNotFoundError(RuntimeError):
    """Raised when no agent configuration exists for a call ID."""


DEFAULT_SYSTEM_PROMPT = "You are a helpful AI voice assistant."


def get_mongo_database() -> Any:
    """Return one process-wide MongoDB client for config lookups."""
    global _mongo_client
    try:
        from pymongo import MongoClient
        uri = os.getenv("MONGODB_URI", "").strip()
        if not uri:
            raise ConfigNotFoundError("MONGODB_URI is not configured.")
        with _mongo_client_lock:
            if _mongo_client is None:
                _mongo_client = MongoClient(
                    uri,
                    maxPoolSize=int(os.getenv("MONGODB_MAX_POOL_SIZE", "50")),
                    minPoolSize=1,
                    serverSelectionTimeoutMS=int(os.getenv("MONGODB_SELECTION_TIMEOUT_MS", "1000")),
                    connectTimeoutMS=int(os.getenv("MONGODB_CONNECT_TIMEOUT_MS", "1000")),
                    socketTimeoutMS=int(os.getenv("MONGODB_SOCKET_TIMEOUT_MS", "2000")),
                    waitQueueTimeoutMS=int(os.getenv("MONGODB_WAIT_QUEUE_TIMEOUT_MS", "1000")),
                    retryReads=True,
                    retryWrites=True,
                )
        client = _mongo_client
        try:
            return client.get_default_database()
        except Exception:
            return client[os.getenv("MONGODB_DATABASE", "sigulon")]
    except ConfigNotFoundError:
        raise
    except Exception as exc:
        raise ConfigNotFoundError("Database connection failed") from exc


async def ping_mongodb() -> bool:
    """Run a bounded MongoDB ping without blocking the async event loop."""
    import asyncio

    return bool(await asyncio.to_thread(get_mongo_database().command, "ping"))


def close_mongodb() -> None:
    """Close the shared MongoDB pool during process shutdown."""
    global _mongo_client
    with _mongo_client_lock:
        client, _mongo_client = _mongo_client, None
    if client is not None:
        client.close()


async def _load_agent_config_from_mongodb(call_id: str) -> AgentConfig:
    """Source-of-truth lookup from database."""
    import asyncio

    def _query() -> AgentConfig:
        client = get_mongo_database()
        from bson import ObjectId

        def find_by_id(collection: Any, value: Any) -> Optional[dict[str, Any]]:
            value_as_string = str(value)
            if ObjectId.is_valid(value_as_string):
                document = collection.find_one({"_id": ObjectId(value_as_string)})
                if document:
                    return document
            return collection.find_one({"_id": value})

        call = find_by_id(client.calls, call_id)
        if not call:
            call = client.calls.find_one({"providerCallId": call_id})

        agent_doc: Optional[dict[str, Any]] = None
        if call and call.get("agentId"):
            agent_doc = find_by_id(client.agents, call["agentId"])
        if not call or not agent_doc:
            raise ConfigNotFoundError(f"No MongoDB call/agent mapping found for {call_id}.")
        if agent_doc.get("status") != "active":
            raise ConfigNotFoundError(f"Agent {agent_doc.get('_id')} is not active.")

        cfg = agent_doc.get("config") or {}
        identity = cfg.get("identity") or {}
        instructions = cfg.get("instructions") or {}
        voice = cfg.get("voice") or {}
        intelligence = cfg.get("intelligence") or {}
        speech = cfg.get("speech") or {}
        tools = cfg.get("tools") or {}
        settings = cfg.get("settings") or {}
        org_id = str(agent_doc.get("organizationId", ""))
        org_doc = find_by_id(client.organizations, org_id) or {}
        bundle = agent_doc.get("bundle") if isinstance(agent_doc.get("bundle"), dict) else None
        direction = call.get("direction") if call.get("direction") in ("inbound", "outbound") else "inbound"

        # Resolve contact name from call metadata or contacts collection
        lead_name: Optional[str] = None
        call_meta = call.get("metadata")
        if isinstance(call_meta, dict):
            lead_name = (
                call_meta.get("lead_name")
                or call_meta.get("name")
                or call_meta.get("customer_name")
                or call_meta.get("firstName")
            )
        if not lead_name and call.get("contactId"):
            contact_doc = find_by_id(client.contacts, call["contactId"])
            if contact_doc:
                lead_name = contact_doc.get("name") or contact_doc.get("firstName")
        if not lead_name and call.get("lead_name"):
            lead_name = call.get("lead_name")

        raw_intro = (
            instructions.get("greeting")
            or instructions.get("introduction")
            or (bundle.get("first_response") if bundle else None)
            or None
        )
        resolved_language = (
            identity.get("language")
            or voice.get("language")
            or "hi-IN"
        )
        intro = resolve_introduction(
            raw_intro,
            lead_name=lead_name,
            language=resolved_language,
        )

        return AgentConfig(
            call_id=call_id,
            agent_id=str(agent_doc["_id"]),
            tenant_id=org_id,
            direction=direction,
            from_number=call.get("fromNumber"),
            to_number=call.get("toNumber"),
            system_prompt=instructions.get("systemPrompt") or instructions.get("system_prompt") or DEFAULT_SYSTEM_PROMPT,
            introduction=intro,
            language=resolved_language,
            voice_id=voice.get("voiceId") or voice.get("voice_id") or "",
            voice_speed=float(voice.get("speed", 1.0)),
            llm_provider=intelligence.get("provider") or "openrouter",
            llm_model=intelligence.get("model") or "google/gemini-2.5-flash",
            stt_provider=speech.get("sttProvider") or "cartesia",
            stt_model=speech.get("sttModel"),
            tts_provider=speech.get("ttsProvider") or "cartesia",
            tts_model=speech.get("ttsModel") or voice.get("model") or CARTESIA_TTS_MODEL,
            enabled_tools=list(tools.get("enabledTools", [])),
            max_concurrent_calls=int(org_doc.get("maxConcurrentCalls", 5)),
            max_call_seconds=int(settings.get("maxCallDuration", 1800)),
            silence_timeout_seconds=int(settings.get("silenceTimeout", 20)),
            record_calls=bool(settings.get("recordingEnabled", True)),
            bundle=bundle,
        )

    return await asyncio.to_thread(_query)


# ---------------------------------------------------------------------------
# Per-tenant concurrency slots (Redis counters)
# ---------------------------------------------------------------------------


async def acquire_concurrency_slot(tenant_id: str, limit: int) -> tuple[bool, int]:
    """Increment the tenant's active-call counter if under ``limit``."""
    try:
        redis_client = get_redis()
        key = TENANT_ACTIVE_CALLS_KEY.format(tenant_id=tenant_id)
        count = int(await redis_client.incr(key))
        if count == 1:
            await redis_client.expire(key, ACTIVE_CALLS_KEY_TTL_SECS)
        if count > limit:
            await redis_client.decr(key)
            log.warning(
                "Concurrency limit hit for tenant %s (%d/%d)", tenant_id, count - 1, limit
            )
            return False, count - 1
        log.info("Concurrency slot acquired for tenant %s (%d/%d)", tenant_id, count, limit)
        return True, count
    except Exception as exc:
        # A process-local count is not a distributed concurrency guard. It is
        # permitted only when explicitly opted into for isolated development.
        allow_local_slots = os.getenv("DEV_ALLOW_LOCAL_SLOTS", "false").lower() == "true"
        if allow_local_slots:
            current = _local_tenant_slots.get(tenant_id, 0) + 1
            if current > limit:
                log.warning(
                    "[local-slots] Concurrency limit hit for tenant %s (%d/%d)",
                    tenant_id, current - 1, limit,
                )
                return False, current - 1
            _local_tenant_slots[tenant_id] = current
            log.info(
                "[local-slots] Concurrency slot acquired for tenant %s (%d/%d) (redis unavailable: %s)",
                tenant_id, current, limit, exc,
            )
            return True, current

        log.error(
            "[redis] concurrency state unavailable for tenant %s: %s; refusing call admission",
            tenant_id,
            exc,
        )
        raise ConcurrencyStateUnavailable(
            "Redis concurrency state is unavailable; call admission is fail-closed."
        ) from exc


async def release_concurrency_slot(tenant_id: str) -> int:
    """Decrement the tenant's active-call counter, floored at zero."""
    if tenant_id in _local_tenant_slots:
        _local_tenant_slots[tenant_id] = max(0, _local_tenant_slots[tenant_id] - 1)

    try:
        redis_client = get_redis()
        key = TENANT_ACTIVE_CALLS_KEY.format(tenant_id=tenant_id)
        count = int(await redis_client.decr(key))
        if count < 0:
            await redis_client.set(key, 0)
            return 0
        return count
    except Exception as exc:
        log.warning("Redis slot release failed: %s", exc)
        return _local_tenant_slots.get(tenant_id, 0)
