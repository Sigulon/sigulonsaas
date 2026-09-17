"""Billing ping tests (no network — httpx is mocked)."""

from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import billing


def _run(coro):
    return asyncio.run(coro)


def _client(status: int, body: object):
    response = MagicMock(status_code=status)
    response.json = MagicMock(return_value=body)
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.post.return_value = response
    return client


class TestReserveUrl(unittest.TestCase):
    def test_trims_slash(self):
        self.assertEqual(
            billing.reserve_url("https://web.test/"),
            "https://web.test/api/internal/credits/reserve",
        )


class TestNotifyReserve(unittest.TestCase):
    def test_missing_config_resolves_false(self):
        async def go():
            with patch.dict(os.environ, {}, clear=False):
                with patch.object(billing.os, "getenv", return_value=""):
                    return await billing.notify_credits_reserve("c1")

        self.assertFalse(_run(go()))

    def test_success(self):
        async def go():
            with patch("httpx.AsyncClient",
                        return_value=_client(200, {"ok": True})):
                return await billing.notify_credits_reserve(
                    "c1", web_base="https://w", secret="s")

        self.assertTrue(_run(go()))

    def test_insufficient_still_true(self):
        async def go():
            with patch("httpx.AsyncClient",
                        return_value=_client(200, {"ok": True, "insufficient": True})):
                return await billing.notify_credits_reserve(
                    "c1", web_base="https://w", secret="s")

        self.assertTrue(_run(go()))

    def test_unknown_call_and_server_error_false(self):
        async def go():
            with patch("httpx.AsyncClient",
                        return_value=_client(404, {"error": "nope"})):
                first = await billing.notify_credits_reserve(
                    "c1", web_base="https://w", secret="s")
            with patch("httpx.AsyncClient",
                        return_value=_client(500, {"error": "bad"})):
                second = await billing.notify_credits_reserve(
                    "c1", web_base="https://w", secret="s")
            return first, second

        self.assertEqual(_run(go()), (False, False))

    def test_transport_error_false(self):
        async def go():
            client = AsyncMock()
            client.__aenter__.return_value = client
            client.post.side_effect = ConnectionError("down")
            with patch("httpx.AsyncClient", return_value=client):
                return await billing.notify_credits_reserve(
                    "c1", web_base="https://w", secret="s")

        self.assertFalse(_run(go()))


if __name__ == "__main__":
    unittest.main()
