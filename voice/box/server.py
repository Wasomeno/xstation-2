#!/usr/bin/env python3
"""Always-on voice box: local Whisper, DeepSeek behind the box."""

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

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import uvicorn

from decide import SYSTEM_PROMPT, decide_from_model_text
from whisper_lang import HOTWORDS, ID_PROMPT, resolve_asr_language

ALLOWED_ORIGINS = (
    "http://127.0.0.1:4174",
    "http://localhost:4174",
    "https://wasomeno.github.io",
)
RATE_WINDOW_S = 60
RATE_MAX = 20
DEEPSEEK_URL = os.environ.get("DEEPSEEK_URL", "https://api.deepseek.com/chat/completions")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
HOST = os.environ.get("VOICE_BOX_HOST", "127.0.0.1")
PORT = int(os.environ.get("VOICE_BOX_PORT", "4175"))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_origin_regex=r"https://wasomeno\.github\.io",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_whisper = None
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


def _whisper_model():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper


def transcribe_path(path: str) -> str:
    from faster_whisper.audio import decode_audio

    model = _whisper_model()
    audio = decode_audio(path, sampling_rate=16000)
    try:
        detected, probability, _probs = model.detect_language(audio, vad_filter=True)
    except Exception:
        detected, probability = "id", 1.0
    language = resolve_asr_language(detected, probability)
    segments, _info = model.transcribe(
        audio,
        language=language,
        task="transcribe",
        vad_filter=True,
        without_timestamps=True,
        condition_on_previous_text=False,
        initial_prompt=ID_PROMPT if language == "id" else None,
        hotwords=HOTWORDS,
        multilingual=False,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


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
    return decide_from_model_text(content or "")


@app.get("/health")
def health():
    has_key = bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())
    payload = {"ok": has_key, "whisper": WHISPER_MODEL, "deepseek": has_key}
    if not has_key:
        return JSONResponse(payload, status_code=503)
    return payload


@app.post("/v1/command")
async def command(request: Request, audio: UploadFile = File(...)):
    origin = request.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS and not origin.startswith("https://wasomeno.github.io"):
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
                transcript = await asyncio.to_thread(transcribe_path, tmp.name)
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"whisper-failed:{type(exc).__name__}",
                ) from exc
        finally:
            Path(tmp.name).unlink(missing_ok=True)

        if not transcript:
            return {
                "action": "clarify",
                "hypotheses": [],
                "text": "Belum ketangkap. Coba sebut produk, atau hubungi kami?",
                "transcript": "",
            }

        try:
            decision = await interpret(transcript)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"interpret-failed:{type(exc).__name__}") from exc
        decision["transcript"] = transcript
        return decision


def main():
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
