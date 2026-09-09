"""Validate voice navigation; uncertainty must leave the page in place."""

from __future__ import annotations

import json
import re
from typing import Any

from sections import SECTION_BY_ID, catalog_for_prompt, resolve_section

_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)

UNCLEAR_ASK = "Mau ke bagian yang mana? Coba ulangi."

SYSTEM_PROMPT = f"""Kamu adalah Station Agent di situs NADI. Kamu driver, bukan pemandu.

Command adalah ucapan pengunjung dalam Bahasa Indonesia atau Inggris untuk dibawa ke sebuah Section.
Jangan menjawab pertanyaan atau mengarang informasi. Pilih hanya Section dari katalog.

Kalau Command menunjuk tepat satu Section, kembalikan Show.
"Apa itu Arkiv?" adalah Show arkiv. Penjelasannya sudah ada di halaman.
Kalau tujuan belum pasti, kembalikan Clarification paling banyak dua hipotesis, meskipun hanya satu dugaan.
Sapaan, ucapan terima kasih, suara tidak jelas, di luar topik, atau "lanjut/yang tadi" tanpa rujukan yang pasti: noop. Jangan menebak tujuan.
Hero HANYA untuk permintaan eksplisit kembali ke beranda / halaman awal / paling atas. Hero bukan fallback untuk ucapan yang tidak dipahami atau kata "mulai".
JANGAN ke contact kecuali pengunjung secara eksplisit minta dihubungi / demo / kontak / QR.
Hormati penyangkalan: "jangan ke beranda" tidak boleh Show hero.
"produk apa saja?" adalah Show work. "customer service WhatsApp" adalah Show crm-ai-agent.
"kelola dokumen" adalah Show arkiv. "buat prototype" adalah Show coframe.
Untuk konten sosial yang belum membedakan BikinKonten dan Lubna, Clarification; jangan pilih sembarang.

Kembalikan JSON saja, salah satu:
{{"action":"show","section":"<id>"}}
{{"action":"clarify","hypotheses":["<id>"],"text":"<pertanyaan singkat yang menyebut hipotesis>"}}
{{"action":"noop"}}

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
    return any(re.search(r"\b" + re.escape(needle) + r"\b", blob) for needle in needles)


def mentions_home(transcript: str | None) -> bool:
    blob = " ".join((transcript or "").lower().split())
    if re.search(r"\b(?:jangan|bukan|tidak|don't|do not)\b", blob):
        return False
    return bool(re.search(
        r"\b(?:hero|home|beranda|halaman (?:utama|awal|depan)|"
        r"(?:ke|to(?: the)?) (?:paling )?(?:atas|awal|depan|top|start|beginning))\b",
        blob,
    ))


def _show(section: str, transcript: str | None) -> dict[str, Any]:
    if section == "contact" and not mentions_contact(transcript):
        return _clarify([], UNCLEAR_ASK)
    if section == "hero" and not mentions_home(transcript):
        return _clarify([], UNCLEAR_ASK)
    return {"action": "show", "section": section}


def decide(payload: dict[str, Any] | None, transcript: str | None = None) -> dict[str, Any]:
    """Only an explicit, valid Show is allowed to navigate."""
    if not isinstance(payload, dict) or not payload:
        return _clarify([], UNCLEAR_ASK)

    action = str(payload.get("action") or "").strip().lower()
    if action == "noop":
        return {"action": "noop"}
    hypotheses = payload.get("hypotheses") or payload.get("hypothesis") or []
    if isinstance(hypotheses, str):
        hypotheses = [hypotheses]
    if not isinstance(hypotheses, list):
        hypotheses = []

    guessed = _unique_sections(hypotheses)
    section = resolve_section(payload.get("section"))
    text = payload.get("text") or payload.get("prompt") or payload.get("clarification")

    if action == "show" or action == "scroll":
        if section and (not guessed or guessed == [section]):
            return _show(section, transcript)
        return _clarify(guessed, text if isinstance(text, str) else None)

    if action in {"clarify", "clarification", "ask"}:
        return _clarify(guessed, text if isinstance(text, str) else None)

    return _clarify(guessed, None)


def decide_from_model_text(text: str, transcript: str | None = None) -> dict[str, Any]:
    return decide(parse_model_json(text), transcript)
