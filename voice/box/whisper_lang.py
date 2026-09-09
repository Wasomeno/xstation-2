"""Pick the Whisper language. Indonesian is primary; auto-detect is untrusted on short clips."""

from __future__ import annotations

ID_FAMILY = frozenset({"id", "ms"})

ID_PROMPT = "XTATION BikinKonten Lubna HireAssess Arkiv CoDev CoFrame CoFinance"

HOTWORDS = "XTATION BikinKonten Lubna HireAssess Arkiv CoDev CoFrame CoFinance"

FOREIGN_ASK = "Bahasanya belum ketangkap. Coba ulangi dalam Bahasa Indonesia?"

_LANG_NAMES = {
    "indonesian": "id",
    "bahasa indonesia": "id",
    "malay": "ms",
    "english": "en",
    "chinese": "zh",
    "mandarin": "zh",
    "japanese": "ja",
    "korean": "ko",
    "javanese": "jw",
    "tagalog": "tl",
    "filipino": "tl",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "arabic": "ar",
    "hindi": "hi",
    "portuguese": "pt",
    "russian": "ru",
    "thai": "th",
    "vietnamese": "vi",
}


def normalize_lang(detected: str | None) -> str:
    raw = (detected or "").strip().lower()
    if not raw:
        return ""
    if raw in ID_FAMILY or len(raw) <= 3:
        return raw
    return _LANG_NAMES.get(raw, raw)


def is_unusable_transcript(text: str | None) -> bool:
    """Silence and prompt-echo must not become a Command."""
    blob = " ".join((text or "").lower().split())
    if len(blob) < 3:
        return True
    prompt = " ".join(ID_PROMPT.lower().split())
    if blob == prompt or (len(blob) > 12 and blob in prompt):
        return True
    echoes = (
        "perintah dalam bahasa indonesia",
        "thank you for watching",
        "thanks for watching",
        "terima kasih sudah menonton",
        "subtitle",
    )
    return blob in echoes or any(blob == echo or blob.startswith(echo + " ") for echo in echoes)


def parse_openai_transcription(payload: dict) -> dict:
    text = (payload.get("text") or "").strip()
    code = normalize_lang(payload.get("language"))
    foreign = is_foreign_language(code, 0.99 if code else 0.0)
    if foreign:
        return {"transcript": "", "foreign": True, "detected": code or "id", "silence": False}
    if is_unusable_transcript(text):
        return {"transcript": "", "foreign": False, "detected": code or "id", "silence": True}
    return {"transcript": text, "foreign": False, "detected": code or "id", "silence": False}


def resolve_asr_language(detected: str | None, probability: float | None) -> str:
    """Always decode as Indonesian. Language-id on short clips is not trusted."""
    del detected, probability
    return "id"


def is_foreign_language(
    detected: str | None,
    probability: float | None,
    all_probs: list[tuple[str, float]] | None = None,
) -> bool:
    """True when the clip is clearly not Indonesian — then do not Show, ask again."""
    code = (detected or "").strip().lower()
    prob = 0.0 if probability is None else float(probability)
    id_mass = 0.0
    if all_probs:
        id_mass = sum(p for lang, p in all_probs if (lang or "").lower() in ID_FAMILY)
    if code in ID_FAMILY:
        return False
    if id_mass >= 0.2:
        return False
    return bool(code) and code not in ID_FAMILY and prob >= 0.75
