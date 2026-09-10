"""Validate voice navigation; uncertainty must leave the page in place."""

from __future__ import annotations

import json
import re
from typing import Any

from sections import PRODUCT_IDS, SECTION_BY_ID, catalog_for_prompt, resolve_section

_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)

UNCLEAR_ASK = "Mau ke bagian yang mana? Coba ulangi."

SYSTEM_PROMPT = f"""Kamu adalah Station Agent di situs NADI. Kamu driver, bukan pemandu.

Command adalah ucapan pengunjung dalam Bahasa Indonesia atau Inggris untuk navigasi atau aksi halaman.
Jangan menjawab pertanyaan atau mengarang informasi. Pilih hanya Section dari katalog dan aksi di bawah.

Kalau Command menunjuk tepat satu Section, kembalikan Show.
"Apa itu Arkiv?" adalah Show arkiv. Penjelasannya sudah ada di halaman.
Kalau tujuan belum pasti, kembalikan Clarification paling banyak dua hipotesis, meskipun hanya satu dugaan.
Sapaan, ucapan terima kasih, suara tidak jelas, di luar topik, atau "lanjut/yang tadi" tanpa rujukan yang pasti: noop. Jangan menebak tujuan.
Hero HANYA untuk permintaan eksplisit kembali ke beranda / halaman awal / paling atas. Hero bukan fallback untuk ucapan yang tidak dipahami atau kata "mulai".
JANGAN ke contact kecuali pengunjung secara eksplisit minta dihubungi / menjadwalkan demo / kontak / QR.
Hormati penyangkalan: "jangan ke beranda" tidak boleh Show hero.
"produk apa saja?" adalah Show work. "customer service WhatsApp" adalah Show crm-ai-agent.
"kelola dokumen" adalah Show arkiv. "buat prototype" adalah Show coframe.
"Bagaimana cara kerja NADI?" dan "Show me the system behind every agent" adalah Show system.
Section system menjelaskan jaringan/ekosistem agent NADI: Build, Scale, Govern, Secure, Optimize, dan Managed by DOT; bukan produk atau CTA kontak.
Kebutuhan ide konten, produksi konten pemasaran rutin, dan membuat banyak konten adalah BikinKonten.
Lubna khusus asisten marketing lewat chat, dari brief sampai publikasi. Kalau hanya "konten sosial" tanpa kebutuhan yang membedakan, Clarification.
Otomasi customer operations dan mengelola pelanggan adalah CRM AI Agent, bukan section Clients (logo pelanggan).
Screening/mencari kandidat lebih cepat adalah HireAssess; developer/fitur proyek lebih cepat adalah CoDev.
Efisiensi proses finansial dan pelacakan data keuangan adalah CoFinance.

"back"/"go back" mundur satu entri action log; "next"/"go next"/"go forward" maju satu entri action log. Browser menyimpan indeksnya, jangan menebak section.
"explore"/"What else can I explore?" mengeksplorasi section berikutnya sesuai posisi halaman, bukan maju dalam riwayat.
Pemutaran demo/video tidak tersedia. Permintaan menonton/memutar demo adalah noop, jangan arahkan ke contact.
Permintaan menjadwalkan/book demo adalah contact, bukan memutar video.
"contact" menampilkan dan memfokuskan CTA: produk yang disebut, "current" untuk "produk ini", atau "contact" untuk kontak umum.
"whatsapp" HANYA untuk permintaan eksplisit membuka WhatsApp. Membicarakan solusi WhatsApp adalah Show crm-ai-agent.
Contact/conversion tidak otomatis membuka WhatsApp. Semua URL dan elemen ditentukan halaman, jangan keluarkan URL atau selector.

Kembalikan JSON saja, salah satu:
{{"action":"show","section":"<id>"}}
{{"action":"back"}}
{{"action":"next"}}
{{"action":"explore"}}
{{"action":"contact","section":"<id produk, current, atau contact>"}}
{{"action":"whatsapp","section":"<id produk, current, atau contact>"}}
{{"action":"clarify","hypotheses":["<id>"],"text":"<pertanyaan singkat yang menyebut hipotesis>"}}
{{"action":"noop"}}

Tulis teks Clarification dalam Bahasa Indonesia.

Knowledge dari AI Product Showcase - AI Voice Nav (contoh Command → JSON; pahami juga parafrase dan terjemahannya):
1. "Show me the solutions." → {{"action":"show","section":"work"}}
2. "Take me to the contact section." → {{"action":"contact","section":"contact"}}
3. "Go back." → {{"action":"back"}}
4. "Take me to the top." → {{"action":"show","section":"hero"}}
5. "Go home." → {{"action":"show","section":"hero"}}
6. "What else can I explore?" → {{"action":"explore"}}
7. "Show me the CRM AI Agent." → {{"action":"show","section":"crm-ai-agent"}}
8. "Show me your AI products." → {{"action":"show","section":"work"}}
9. "I want to see the demo." → {{"action":"noop"}} (demo video dikecualikan)
10. "Play the demo." → {{"action":"noop"}} (demo video dikecualikan)
11. "I want to automate my customer operations." → {{"action":"show","section":"crm-ai-agent"}}
12. "I need something to help manage my customers." → {{"action":"show","section":"crm-ai-agent"}}
13. "I need help coming up with content ideas." → {{"action":"show","section":"bikinkonten"}}
14. "I have to create a lot of marketing content every week." → {{"action":"show","section":"bikinkonten"}}
15. "I need help screening candidates." → {{"action":"show","section":"hireassess"}}
16. "I want to find the right candidates faster." → {{"action":"show","section":"hireassess"}}
17. "I want AI to help my developers build faster." → {{"action":"show","section":"codev"}}
18. "I want to reduce the time it takes to build features on my project development" → {{"action":"show","section":"codev"}}
19. "I want to make our financial processes more efficient." → {{"action":"show","section":"cofinance"}}
20. "I need help keeping track of our financial data." → {{"action":"show","section":"cofinance"}}
21. "I want to talk to your team." → {{"action":"contact","section":"contact"}}
22. "How can I get in touch?" → {{"action":"contact","section":"contact"}}
23. "I'm interested in Product BikinKonten. I want discuss with the team" → {{"action":"contact","section":"bikinkonten"}}

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
    raw_section = payload.get("section")
    section = resolve_section(raw_section) if isinstance(raw_section, str) else None
    text = payload.get("text") or payload.get("prompt") or payload.get("clarification")

    if action in {"back", "next", "explore", "contact", "whatsapp"}:
        blob = " ".join((transcript or "").lower().replace("’", "'").split())
        patterns = {
            "back": r"\b(back|previous|kembali|balik|sebelumnya)\b",
            "next": r"\b(next|forward|maju|lanjut|berikutnya|selanjutnya)\b",
            "explore": r"\b(explore|what else|anything else|jelajah|eksplorasi|lainnya|apa lagi|section berikutnya|bagian berikutnya)\b",
            "whatsapp": r"\b(open|launch|buka|bukakan)\b.*\b(whatsapp|wa)\b",
        }
        requested = mentions_contact(blob) if action == "contact" else re.search(patterns[action], blob)
        if not requested or re.search(r"\b(jangan|bukan|tidak|don't|do not|not)\b", blob):
            return _clarify([], UNCLEAR_ASK)
        if action in {"back", "next", "explore"}:
            return _clarify(guessed, None) if guessed or raw_section else {"action": action}
        target = section or ("current" if raw_section == "current" else None)
        allowed = PRODUCT_IDS | {"current", "contact"}
        if target not in allowed or (guessed and guessed != [target]):
            return _clarify(guessed, None)
        return {"action": action, "section": target}

    if action == "show" or action == "scroll":
        if section and (not guessed or guessed == [section]):
            return _show(section, transcript)
        return _clarify(guessed, text if isinstance(text, str) else None)

    if action in {"clarify", "clarification", "ask"}:
        return _clarify(guessed, text if isinstance(text, str) else None)

    return _clarify(guessed, None)


def decide_from_model_text(text: str, transcript: str | None = None) -> dict[str, Any]:
    return decide(parse_model_json(text), transcript)
