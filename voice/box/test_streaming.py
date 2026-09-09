import asyncio
import json
import unittest

from streaming import relay_transcripts


class Upstream:
    def __init__(self):
        self.events = asyncio.Queue()

    def __aiter__(self):
        return self

    async def __anext__(self):
        event = await self.events.get()
        if event is None:
            raise StopAsyncIteration
        return event

    def send(self, kind, item_id, **payload):
        self.events.put_nowait(json.dumps({"type": kind, "item_id": item_id, **payload}))


class Client:
    def __init__(self):
        self.messages = []
        self.events = asyncio.Queue()

    async def send_json(self, message):
        self.messages.append(message)
        self.events.put_nowait(message)

    async def next(self, kind, item_id):
        async def matching():
            while True:
                message = await self.events.get()
                if message.get("type") == kind and message.get("item_id") == item_id:
                    return message

        return await asyncio.wait_for(matching(), 0.2)


class StreamingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.upstream = Upstream()
        self.client = Client()
        self.runner = None

    async def asyncTearDown(self):
        if self.runner:
            self.runner.cancel()
            await asyncio.gather(self.runner, return_exceptions=True)

    def start(self, interpret):
        self.runner = asyncio.create_task(relay_transcripts(self.upstream, self.client, interpret))

    def speech(self, item_id):
        self.upstream.send("input_audio_buffer.speech_started", item_id)

    def delta(self, item_id, text):
        self.upstream.send("conversation.item.input_audio_transcription.delta", item_id, delta=text)

    def complete(self, item_id, text=""):
        self.upstream.send("conversation.item.input_audio_transcription.completed", item_id, transcript=text)

    async def test_processing_ignores_interruptions_and_finishes_original_request(self):
        interpreting = asyncio.Event()
        release = asyncio.Event()
        calls = []

        async def interpret(transcript):
            calls.append(transcript)
            if transcript == "buka Arkiv":
                interpreting.set()
                await release.wait()
                return {"action": "show", "section": "arkiv"}
            return {"action": "show", "section": "codev"}

        self.start(interpret)
        self.complete("A", "buka Arkiv")
        await asyncio.wait_for(interpreting.wait(), 0.2)
        self.speech("B")
        self.delta("B", "lihat HireAssess")
        self.complete("B")
        self.delta("C", "suara latar tanpa speech_started")
        await asyncio.sleep(0)
        release.set()
        self.assertEqual((await self.client.next("decision", "A"))["section"], "arkiv")
        self.complete("C", "kembali ke beranda")
        self.complete("D", "CoDev")
        self.assertEqual((await self.client.next("decision", "D"))["transcript"], "CoDev")
        self.assertEqual(calls, ["buka Arkiv", "CoDev"])
        self.assertFalse(any(m.get("item_id") in {"B", "C"} for m in self.client.messages))

    async def test_command_failures_are_recoverable_and_do_not_mix_transcripts(self):
        calls = []

        async def interpret(transcript):
            calls.append(transcript)
            if transcript == "buka Arkiv":
                raise RuntimeError("temporary interpretation failure")
            return {"action": "show", "section": "hireassess"}

        self.start(interpret)
        self.speech("A")
        self.complete("A", "buka Arkiv")
        await self.client.next("noop", "A")
        self.speech("B")
        self.delta("B", "jangan ikut ")
        self.upstream.send("conversation.item.input_audio_transcription.failed", "B", error={"message": "temporary"})
        await self.client.next("noop", "B")
        self.speech("C")
        self.delta("C", "lihat HireAssess")
        self.complete("C")
        result = await self.client.next("decision", "C")
        self.assertEqual(result["transcript"], "lihat HireAssess")
        self.assertEqual(calls, ["buka Arkiv", "lihat HireAssess"])
        self.assertFalse(any(m["type"] == "error" for m in self.client.messages))
        self.assertFalse(self.runner.done())

    async def test_disconnect_or_cancellation_cleans_pending_interpretation(self):
        for end in ("disconnect", "cancel"):
            with self.subTest(end=end):
                self.upstream = Upstream()
                self.client = Client()
                interpreting = asyncio.Event()
                cancelled = asyncio.Event()

                async def interpret(transcript):
                    interpreting.set()
                    try:
                        await asyncio.Future()
                    finally:
                        cancelled.set()

                self.start(interpret)
                self.speech("A")
                self.complete("A", "buka Arkiv")
                await asyncio.wait_for(interpreting.wait(), 0.2)
                if end == "disconnect":
                    self.upstream.events.put_nowait(None)
                    await asyncio.wait_for(self.runner, 0.2)
                else:
                    self.runner.cancel()
                    with self.assertRaises(asyncio.CancelledError):
                        await asyncio.wait_for(self.runner, 0.2)
                await asyncio.wait_for(cancelled.wait(), 0.2)
                self.assertFalse(any(m["type"] == "decision" for m in self.client.messages))


if __name__ == "__main__":
    unittest.main()
