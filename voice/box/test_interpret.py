import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

import server


class InterpretTests(unittest.IsolatedAsyncioTestCase):
    async def test_deepseek_request_and_validated_navigation(self):
        client = AsyncMock()
        client.post.return_value = httpx.Response(200, json={
            "choices": [{"message": {"content": '{"action":"show","section":"codev"}'}}]
        })
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}), patch.object(
            server.httpx, "AsyncClient"
        ) as factory:
            factory.return_value.__aenter__.return_value = client
            self.assertEqual(await server.interpret("CoDev"), {"action": "show", "section": "codev"})
        args, kwargs = client.post.call_args
        self.assertEqual(args[0], "https://api.deepseek.com/chat/completions")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(kwargs["json"]["model"], "deepseek-v4-flash")
        self.assertEqual(kwargs["json"]["response_format"], {"type": "json_object"})

    async def test_missing_deepseek_key_is_unavailable(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}):
            with self.assertRaises(HTTPException) as error:
                await server.interpret("CoDev")
            self.assertEqual(error.exception.status_code, 503)
            self.assertEqual(server.health().status_code, 503)
