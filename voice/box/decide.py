"""Turn a model payload into a Show or a Clarification."""

from __future__ import annotations

import json
import re
from typing import Any

from sections import SECTION_BY_ID, catalog_for_prompt, resolve_section

_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)

UNCLEAR_ASK = "Mau ke bagian yang mana? Coba ulangi."

SYSTEM_PROMPT = f"""Kamu adalah Station Agent di situs XTATION. Kamu driver, bukan pemandu.

Command adalah permintaan lisan dalam Bahasa Indonesia untuk dibawa ke sebuah Section.
Jangan menjawab pertanyaan. Jangan ngobrol. Jangan buat aksi selain Show.

Kalau Command menunjuk tepat satu Section, kembalikan Show.
"Apa itu Arkiv?" adalah Show arkiv. Penjelasannya sudah ada di halaman.
Kalau nol atau beberapa Section cocok, kembalikan Clarification paling banyak dua hipotesis.
Di luar topik, bahasa asing, atau tidak jelas: Clarification yang menanyakan ulang. JANGAN Show. JANGAN ke contact kecuali pengunjung secara eksplisit minta dihubungi / demo / kontak / QR.

Kembalikan JSON saja, salah satu:
{{"action":"show","section":"<id>"}}
{{"action":"clarify","hypotheses":["<id>"],"text":"<pertanyaan singkat yang menyebut hipotesis>"}}

Tulis teks Clarification dalam Bahasa Indonesia.

Sections:
{catalog_for_prompt()}
"""


def parse_model_json(text: str) -> dict[str, Any] | None:
    if not text or not str(text).strip():
        return None
    raw = str(text).strip()
    fenced = _FENCE.search(raw)
    if fenced:
        raw = fenced.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        payload = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _unique_sections(names: list[Any]) -> list[str]:
    found: list[str] = []
    for name in names:
        section_id = resolve_section(str(name) if name is not None else None)
        if section_id and section_id not in found:
            found.append(section_id)
    return found[:2]


def _clarify(hypotheses: list[str], text: str | None) -> dict[str, Any]:
    labels = [SECTION_BY_ID[item].label for item in hypotheses if item in SECTION_BY_ID]
    prompt = (text or "").strip()
    if not prompt:
        if len(labels) == 2:
            prompt = f"{labels[0]}, atau {labels[1]}?"
        elif len(labels) == 1:
            prompt = f"{labels[0]}?"
        else:
            prompt = UNCLEAR_ASK
    return {"action": "clarify", "hypotheses": hypotheses, "text": prompt}


def mentions_contact(transcript: str | None) -> bool:
    blob = " ".join((transcript or "").lower().split())
    if not blob:
        return False
    if resolve_section(blob) == "contact":
        return True
    contact = SECTION_BY_ID["contact"]
    needles = (contact.id, contact.label.lower(), *contact.aliases)
    return any(needle in blob for needle in needles)


def _guard_contact(result: dict[str, Any], transcript: str | None) -> dict[str, Any]:
    if result.get("action") == "show" and result.get("section") == "contact":
        if not mentions_contact(transcript):
            return _clarify([], UNCLEAR_ASK)
    return result


def decide(payload: dict[str, Any] | None, transcript: str | None = None) -> dict[str, Any]:
    """Apply the single-clear-Hypothesis rule to a model payload."""
    if not payload:
        return _clarify([], UNCLEAR_ASK)

    action = str(payload.get("action") or "").strip().lower()
    hypotheses = payload.get("hypotheses") or payload.get("hypothesis") or []
    if isinstance(hypotheses, str):
        hypotheses = [hypotheses]
    if not isinstance(hypotheses, list):
        hypotheses = []

    guessed = _unique_sections(hypotheses)
    section = resolve_section(payload.get("section"))
    text = payload.get("text") or payload.get("prompt") or payload.get("clarification")

    if action == "show" or action == "scroll":
        if section:
            return _guard_contact({"action": "show", "section": section}, transcript)
        if len(guessed) == 1:
            return _guard_contact({"action": "show", "section": guessed[0]}, transcript)
        return _clarify(guessed, text if isinstance(text, str) else None)

    if action in {"clarify", "clarification", "ask"}:
        if len(guessed) == 1:
            return _guard_contact({"action": "show", "section": guessed[0]}, transcript)
        return _clarify(guessed, text if isinstance(text, str) else None)

    if section and not guessed:
        return _guard_contact({"action": "show", "section": section}, transcript)
    if len(guessed) == 1:
        return _guard_contact({"action": "show", "section": guessed[0]}, transcript)
    return _clarify(guessed, None)


def decide_from_model_text(text: str, transcript: str | None = None) -> dict[str, Any]:
    return decide(parse_model_json(text), transcript)
