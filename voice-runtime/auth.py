"""Control-plane auth helpers for the LiveKit voice worker.

The Next.js control plane and campaign worker call internal routes server to
server with ``Authorization: Bearer <INTERNAL_API_SECRET>``. Tool and
postcall callbacks reuse the same secret (runtime-stream-auth).

Fail-closed: if ``INTERNAL_API_SECRET`` is not configured, callers get an
explicit error (never an open gate). No FastAPI/HTTP framework import here
so the worker stays dependency-light.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time

log = logging.getLogger("voice-runtime.auth")


def internal_secret() -> str:
    return os.getenv("INTERNAL_API_SECRET", "")


def internal_auth_headers(secret: str | None = None) -> dict[str, str]:
    """Bearer headers for org-scoped callbacks to the control API."""
    token = secret if secret is not None else internal_secret()
    if not token:
        raise RuntimeError("INTERNAL_API_SECRET is not configured.")
    return {"Authorization": f"Bearer {token}"}


def check_internal_secret(authorization: str | None) -> None:
    """Validate a Bearer token. Raises PermissionError / RuntimeError."""
    secret = internal_secret()
    if not secret:
        log.error("Internal route called with no INTERNAL_API_SECRET configured")
        raise RuntimeError("internal API not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise PermissionError("missing bearer token")
    token = authorization[len("Bearer "):].strip()
    if not hmac.compare_digest(token, secret):
        raise PermissionError("invalid internal token")


def verify_runtime_stream_token(call_id: str, token: str | None) -> bool:
    """Validate a short-lived token issued by the control plane.

    Kept for backward compatibility with any direct-dial paths during the
    dual-run window. LiveKit SIP dispatch uses signed job metadata instead.
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


__all__ = [
    "check_internal_secret",
    "internal_auth_headers",
    "internal_secret",
    "verify_runtime_stream_token",
]
