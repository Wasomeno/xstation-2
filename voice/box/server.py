#!/usr/bin/env python3
"""Always-on voice box: OpenAI transcription, DeepSeek behind the box."""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()

import json
import logging

from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import uvicorn
import websockets

from decide import SYSTEM_PROMPT, decide_from_model_text
from whisper_lang import FOREIGN_ASK, ID_PROMPT, parse_openai_transcription
from streaming import relay_transcripts

ALLOWED_ORIGINS = tuple(origin.strip().rstrip("/") for origin in os.environ.get(
    "VOICE_BOX_ALLOWED_ORIGINS",
    "http://127.0.0.1:4174,http://localhost:4174,https://wasomeno.github.io",
).split(",") if origin.strip())
RATE_WINDOW_S = 60
RATE_MAX = 20
DEEPSEEK_URL = os.environ.get("DEEPSEEK_URL", "https://api.deepseek.com/chat/completions")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
OPENAI_TRANSCRIBE_URL = os.environ.get(
    "OPENAI_TRANSCRIBE_URL",
    "https://api.openai.com/v1/audio/transcriptions",
)
OPENAI_TRANSCRIBE_MODEL = os.environ.get("OPENAI_TRANSCRIBE_MODEL", "gpt-live-transcribe")
OPENAI_REALTIME_URL = os.environ.get(
    "OPENAI_REALTIME_URL",
    "wss://api.openai.com/v1/realtime?intent=transcription",
)
log = logging.getLogger("voice.box")
SESSION_UPDATE = {
    "type": "session.update",
    "session": {
        "type": "transcription",
        "audio": {
            "input": {
                "format": {"type": "audio/pcm", "rate": 24000},
                "transcription": {
                    "model": "gpt-live-transcribe",
                    "prompt": "Pengunjung situs NADI berbicara dalam Bahasa Indonesia.",
                    "keywords": [
                        "NADI",
                        "BikinKonten",
                        "Lubna",
                        "CRM AI Agent",
                        "HireAssess",
                        "Arkiv",
                        "CoDev",
                        "CoFrame",
                        "CoFinance",
                    ],
                    "languages": ["id", "en"],
                    "delay": "low",
                },
                "turn_detection": None,
            }
        },
    },
}
HOST = os.environ.get("VOICE_BOX_HOST", "127.0.0.1")
PORT = int(os.environ.get("VOICE_BOX_PORT", "4175"))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_busy = asyncio.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_ok(ip: str) -> bool:
    now = time.monotonic()
    bucket = _hits[ip]
    while bucket and now - bucket[0] > RATE_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= RATE_MAX:
        return False
    bucket.append(now)
    return True


async def transcribe_openai(path: str) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="openai-key-missing")
    audio_bytes = Path(path).read_bytes()
    filename = Path(path).name or "clip.webm"

    async def send(client: httpx.AsyncClient, data: dict) -> httpx.Response:
        return await client.post(
            OPENAI_TRANSCRIBE_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files={"file": (filename, audio_bytes, "application/octet-stream")},
        )

    async with httpx.AsyncClient(timeout=60) as client:
        response = await send(
            client,
            {
                "model": OPENAI_TRANSCRIBE_MODEL,
                "response_format": "verbose_json",
                "prompt": ID_PROMPT,
            },
        )
        if response.status_code >= 400:
            response = await send(
                client,
                {
                    "model": OPENAI_TRANSCRIBE_MODEL,
                    "response_format": "json",
                    "language": "id",
                    "prompt": ID_PROMPT,
                },
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"openai-transcribe:{response.status_code}")
        payload = response.json()
        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail="openai-transcribe-shape")
        return parse_openai_transcription(payload)


async def interpret(transcript: str) -> dict:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="deepseek-key-missing")
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            DEEPSEEK_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEEPSEEK_MODEL,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ],
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="deepseek-failed")
    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="deepseek-shape") from exc
    return decide_from_model_text(content or "", transcript)


@app.get("/health")
def health():
    has_deepseek = bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())
    has_openai = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    payload = {
        "ok": has_deepseek and has_openai,
        "transcribe": OPENAI_TRANSCRIBE_MODEL,
        "openai": has_openai,
        "deepseek": has_deepseek,
        "model": DEEPSEEK_MODEL,
    }
    if not payload["ok"]:
        return JSONResponse(payload, status_code=503)
    return payload


@app.post("/v1/command")
async def command(request: Request, audio: UploadFile = File(...)):
    origin = request.headers.get("origin", "")
    if not _origin_ok(origin):
        raise HTTPException(status_code=403, detail="origin")
    ip = _client_ip(request)
    if not _rate_ok(ip):
        raise HTTPException(status_code=429, detail="rate")
    if _busy.locked():
        return JSONResponse({"action": "busy"}, status_code=429)

    suffix = Path(audio.filename or "clip.webm").suffix or ".webm"
    body = await audio.read()
    if not body:
        raise HTTPException(status_code=400, detail="empty")

    async with _busy:
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            tmp.write(body)
            tmp.close()
            try:
                asr = await transcribe_openai(tmp.name)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"transcribe-failed:{type(exc).__name__}",
                ) from exc
        finally:
            Path(tmp.name).unlink(missing_ok=True)

        if asr.get("foreign"):
            return {
                "action": "clarify",
                "hypotheses": [],
                "text": FOREIGN_ASK,
                "transcript": asr.get("transcript") or "",
            }

        if asr.get("silence"):
            return {"action": "noop", "hypotheses": [], "text": "", "transcript": ""}

        transcript = (asr.get("transcript") or "").strip()
        if not transcript:
            return {"action": "noop", "hypotheses": [], "text": "", "transcript": ""}

        try:
            decision = await interpret(transcript)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"interpret-failed:{type(exc).__name__}") from exc
        decision["transcript"] = transcript
        return decision


def _origin_ok(origin: str) -> bool:
    if not origin:
        return True
    return origin in ALLOWED_ORIGINS


@app.websocket("/v1/stream")
async def stream(websocket: WebSocket):
    origin = websocket.headers.get("origin", "")
    if not _origin_ok(origin):
        await websocket.close(code=1008)
        return
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        await websocket.close(code=1013)
        return
    await websocket.accept()
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with websockets.connect(
            OPENAI_REALTIME_URL,
            additional_headers=headers,
            max_size=8 * 1024 * 1024,
        ) as openai_ws:
            await openai_ws.send(json.dumps(SESSION_UPDATE))
            while True:
                boot = json.loads(await asyncio.wait_for(openai_ws.recv(), timeout=10))
                if boot.get("type") == "session.updated":
                    break
                if boot.get("type") == "error":
                    detail = boot.get("error") or {}
                    await websocket.send_json(
                        {"type": "error", "message": detail.get("message") or "openai"}
                    )
                    return
            await websocket.send_json({"type": "ready"})

            async def from_client() -> None:
                try:
                    while True:
                        message = await websocket.receive_json()
                        kind = message.get("type")
                        if kind == "audio" and message.get("pcm"):
                            await openai_ws.send(
                                json.dumps(
                                    {
                                        "type": "input_audio_buffer.append",
                                        "audio": message["pcm"],
                                    }
                                )
                            )
                        elif kind == "commit":
                            await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                        elif kind == "stop":
                            break
                except WebSocketDisconnect:
                    pass
                finally:
                    try:
                        await openai_ws.close()
                    except Exception:
                        pass

            tasks = [
                asyncio.create_task(from_client()),
                asyncio.create_task(relay_transcripts(openai_ws, websocket, interpret)),
            ]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

    except Exception:
        log.exception("realtime stream failed")
        try:
            await websocket.send_json({"type": "error", "message": "stream"})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


def main():
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
