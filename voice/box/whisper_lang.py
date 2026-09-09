"""Pick the Whisper language. Indonesian is primary; auto-detect is untrusted on short clips."""

from __future__ import annotations

ID_FAMILY = frozenset({"id", "ms"})

ID_PROMPT = (
    "Perintah dalam bahasa Indonesia untuk situs XTATION. "
    "Produk: BikinKonten, Lubna, HireAssess, Arkiv, CoDev, CoFrame, CoFinance, CRM AI Agent. "
    "Tunjukkan produk atau hubungi kami."
)

HOTWORDS = "XTATION BikinKonten Lubna HireAssess Arkiv CoDev CoFrame CoFinance"

FOREIGN_ASK = "Bahasanya belum ketangkap. Coba ulangi dalam Bahasa Indonesia?"


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
