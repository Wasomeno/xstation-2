"""Pick the Whisper language. Indonesian is primary; auto-detect is untrusted on short clips."""

from __future__ import annotations

ID_PROMPT = (
    "Perintah dalam bahasa Indonesia untuk situs XTATION. "
    "Produk: BikinKonten, Lubna, HireAssess, Arkiv, CoDev, CoFrame, CoFinance, CRM AI Agent. "
    "Tunjukkan produk atau hubungi kami."
)

HOTWORDS = "XTATION BikinKonten Lubna HireAssess Arkiv CoDev CoFrame CoFinance"


def resolve_asr_language(detected: str | None, probability: float | None) -> str:
    """Map Whisper language-id to a decode language.

    Short clips often come back as Malay, Javanese, or a random high-resource
    language. Those are decoded as Indonesian. English is kept only when the
    detector is confident.
    """
    code = (detected or "").strip().lower()
    prob = 0.0 if probability is None else float(probability)
    if code == "en" and prob >= 0.85:
        return "en"
    return "id"
