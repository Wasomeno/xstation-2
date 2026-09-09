"""Keep live captions moving while only the current command can navigate."""

import asyncio
import json

from whisper_lang import is_unusable_transcript


async def relay_transcripts(upstream, client, interpret):
    current_item = None
    partial = ""
    completed = False
    pending = None
    tasks = set()
    retired_items = set()

    def cancel_pending():
        nonlocal pending
        if pending is not None:
            pending.cancel()
            pending = None

    def finished(task):
        tasks.discard(task)
        if not task.cancelled():
            task.exception()  # Transport shutdown is handled by the session's reader.

    async def decide_turn(transcript, item_id):
        try:
            decision = await asyncio.wait_for(interpret(transcript), timeout=12)
        except Exception:
            # A failed command does not end the visitor's session.
            if item_id == current_item:
                await client.send_json({"type": "noop", "item_id": item_id})
            return
        if item_id == current_item:
            await client.send_json({**decision, "type": "decision", "item_id": item_id, "transcript": transcript})

    try:
        async for raw in upstream:
            event = json.loads(raw)
            kind = event.get("type")
            item_id = event.get("item_id")
            starts_turn = kind == "input_audio_buffer.speech_started" or (
                kind in {"conversation.item.input_audio_transcription.delta", "conversation.item.input_audio_transcription.completed"}
                and item_id != current_item and item_id not in retired_items
            )
            if starts_turn:
                if current_item is not None:
                    retired_items.add(current_item)
                current_item = item_id
                partial = ""
                completed = False
                cancel_pending()
                await client.send_json({"type": "speech_started", "item_id": item_id})
                if kind == "input_audio_buffer.speech_started":
                    continue
            if kind == "error":
                detail = event.get("error") or {}
                if detail.get("code") == "input_audio_buffer_commit_empty":
                    continue
                await client.send_json({"type": "error", "message": detail.get("message") or "openai"})
                return
            if item_id != current_item or completed:
                continue
            if kind == "conversation.item.input_audio_transcription.delta":
                partial += event.get("delta") or ""
                await client.send_json({"type": "delta", "item_id": item_id, "text": partial})
            elif kind == "input_audio_buffer.speech_stopped":
                await client.send_json({"type": "speech_stopped", "item_id": item_id})
            elif kind == "conversation.item.input_audio_transcription.completed":
                transcript = (event.get("transcript") or partial).strip()
                partial = ""
                completed = True
                if is_unusable_transcript(transcript):
                    await client.send_json({"type": "noop", "item_id": item_id})
                    continue
                await client.send_json({"type": "final", "item_id": item_id, "transcript": transcript})
                pending = asyncio.create_task(decide_turn(transcript, item_id))
                tasks.add(pending)
                pending.add_done_callback(finished)
            elif kind == "conversation.item.input_audio_transcription.failed":
                partial = ""
                completed = True
                await client.send_json({"type": "noop", "item_id": item_id})
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
