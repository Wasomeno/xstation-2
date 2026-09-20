import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

import server


class InterpretTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"VOICE_LLM_PROVIDER": "deepseek"})
        env.start()
        self.addCleanup(env.stop)

    def test_origin_checks_require_an_exact_configured_domain(self):
        with patch.object(server, "ALLOWED_ORIGINS", ("https://nadi.example",)):
            self.assertTrue(server._origin_ok("https://nadi.example"))
            self.assertTrue(server._origin_ok(""))
            for origin in ("https://nadi.example.evil.test", "http://nadi.example", "https://wasomeno.github.io.evil.test"):
                self.assertFalse(server._origin_ok(origin))

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


class JevTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        env = patch.dict(os.environ, {
            "VOICE_LLM_PROVIDER": "jev", "TYPESAFE_API_KEY": "test-jev-key",
            "DEEPSEEK_API_KEY": "", "OPENAI_API_KEY": "test-openai-key",
        })
        env.start()
        self.addCleanup(env.stop)

    async def test_jev_navigation_uses_typed_api_and_existing_guards(self):
        client = AsyncMock()
        with patch.object(server.httpx, "AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            for choice, transcript, expected in (
                ("show:codev", "CoDev", {"action": "show", "section": "codev"}),
                ("next", "Next", {"action": "next"}),
                ("demo:current", "Play the demo", {"action": "demo", "section": "current"}),
                ("noop", "Halo", {"action": "noop"}),
                ("clarify", "Yang itu", {"action": "clarify", "hypotheses": [], "text": "Mau ke bagian yang mana? Coba ulangi."}),
                ("whatsapp:codev", "Don't open WhatsApp CoDev", {"action": "clarify", "hypotheses": [], "text": "Mau ke bagian yang mana? Coba ulangi."}),
            ):
                client.post.return_value = httpx.Response(200, json={
                    "answers": {"decision": {"type": "choice", "choice": choice}}
                })
                self.assertEqual(await server.interpret(transcript), expected)
            args, kwargs = client.post.call_args
            self.assertEqual(args[0], "https://api.typesafe.ai/v1/systemone")
            self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-jev-key")
            self.assertEqual(kwargs["json"]["model"], "jev-latest")
            self.assertEqual(kwargs["json"]["state"], "Don't open WhatsApp CoDev")
            question = kwargs["json"]["questions"]["decision"]
            self.assertEqual(question["type"], "choice")
            self.assertIn("show:colegal", question["criteria"])
            self.assertNotIn("demo:codev", question["criteria"])

    async def test_jev_errors_are_controlled(self):
        client = AsyncMock()
        with patch.object(server.httpx, "AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            for response in (
                httpx.Response(401, json={"error": "unauthorized"}),
                httpx.Response(200, text="not json"),
                httpx.Response(200, json={}),
                httpx.Response(200, json={"answers": {"decision": {"choice": "show:unknown"}}}),
                httpx.Response(200, json={"answers": {"decision": {"choice": []}}}),
            ):
                client.post.return_value = response
                with self.assertRaises(HTTPException) as error:
                    await server.interpret("CoDev")
                self.assertEqual(error.exception.status_code, 502)

    async def test_provider_health_requires_only_selected_key(self):
        health = server.health()
        self.assertIsInstance(health, dict)
        self.assertTrue(health["ok"])
        self.assertEqual(health["provider"], "jev")
        self.assertEqual(health["model"], "jev-latest")
        with patch.dict(os.environ, {"TYPESAFE_API_KEY": ""}):
            self.assertEqual(server.health().status_code, 503)
            with self.assertRaises(HTTPException) as error:
                await server.interpret("CoDev")
            self.assertEqual(error.exception.detail, "jev-key-missing")
        with patch.dict(os.environ, {"VOICE_LLM_PROVIDER": "typo"}):
            self.assertEqual(server.health().status_code, 503)
            with self.assertRaises(HTTPException) as error:
                await server.interpret("CoDev")
            self.assertEqual(error.exception.detail, "llm-provider-invalid")
