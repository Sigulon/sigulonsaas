"""Workspace-aware Plivo credential resolution for the campaign worker.

The web service stores each BYOC pair as AES-256-GCM ciphertext. This module
mirrors ``src/lib/crypto.ts`` exactly: SHA-256 of ``ENCRYPTION_SECRET`` is the
key, and the stored payload is ``ciphertext_hex:auth_tag_hex``. Platform
credentials remain a fallback for workspaces with no active Plivo account.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import store as store_mod

log = logging.getLogger("campaign-worker.credentials")


def _decrypt_payload(encrypted: str, iv_hex: str, encryption_secret: str) -> dict[str, str]:
    if len(encryption_secret) < 32:
        raise ValueError("ENCRYPTION_SECRET must contain at least 32 characters")
    ciphertext_hex, auth_tag_hex = encrypted.split(":", 1)
    key = hashlib.sha256(encryption_secret.encode("utf-8")).digest()
    plaintext = AESGCM(key).decrypt(
        bytes.fromhex(iv_hex),
        bytes.fromhex(ciphertext_hex + auth_tag_hex),
        None,
    )
    parsed = json.loads(plaintext.decode("utf-8"))
    auth_id = str(parsed.get("authId") or "").strip()
    auth_token = str(parsed.get("authToken") or "").strip()
    if not auth_id or not auth_token:
        raise ValueError("stored Plivo credentials are incomplete")
    return {"auth_id": auth_id, "auth_token": auth_token}


def get_plivo_credentials(
    client: Any,
    org_id: str,
    *,
    platform_auth_id: str,
    platform_auth_token: str,
    encryption_secret: str,
) -> Optional[dict[str, str]]:
    """Return active workspace credentials or a complete platform fallback."""
    account = store_mod.get_active_provider_account(client, org_id, "plivo")
    if account is not None:
        try:
            return _decrypt_payload(
                account["credentials_encrypted"], account["encryption_iv"], encryption_secret
            )
        except Exception as exc:  # noqa: BLE001 - credentials must never reach logs
            log.error("cannot decrypt Plivo credentials for organization %s: %s", org_id, exc)
            return None
    if platform_auth_id and platform_auth_token:
        return {"auth_id": platform_auth_id, "auth_token": platform_auth_token}
    return None


__all__ = ["get_plivo_credentials"]
