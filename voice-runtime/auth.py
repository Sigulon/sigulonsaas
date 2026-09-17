"""Internal API auth: shared-secret gate for ``/internal/*`` routes.

The Next.js control plane and campaign worker call these routes server to
server. Browsers never see them. The secret travels as
``Authorization: Bearer <INTERNAL_API_SECRET>``.

Fail-closed: if ``INTERNAL_API_SECRET`` is not configured, every internal
route answers 503 (never accidentally open).
"""

from __future__ import annotations

import base64
import hmac
import hashlib
import logging
import os
import time

from fastapi import Header, HTTPException, status

log = logging.getLogger("voice-runtime.auth")


def internal_secret() -> str:
    return os.getenv("INTERNAL_API_SECRET", "")


async def require_internal_secret(
    authorization: str | None = Header(default=None),
) -> None:
    """FastAPI dependency: raise 401/503 unless the bearer secret matches."""
    secret = internal_secret()
    if not secret:
        log.error("Internal route called with no INTERNAL_API_SECRET configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="internal API not configured",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    token = authorization[len("Bearer "):].strip()
    if not hmac.compare_digest(token, secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )


def verify_runtime_stream_token(call_id: str, token: str | None) -> bool:
    """Validate a short-lived media-socket token issued by the control plane.

    Plivo streams do not include webhook HMAC headers. The same internal
    secret used for server-to-server calls signs ``v1.expiry.signature`` so a
    guessed MongoDB call id cannot activate a billable voice pipeline.
    """
    secret = internal_secret()
    if not secret or not token:
        return False
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return False
    try:
        expires_at = int(parts[1])
    except ValueError:
        return False
    if expires_at < int(time.time()):
        return False
    message = f"v1.{call_id}.{expires_at}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    try:
        received = base64.urlsafe_b64decode(parts[2] + "=" * (-len(parts[2]) % 4))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(received, expected)


__all__ = ["internal_secret", "require_internal_secret", "verify_runtime_stream_token"]
