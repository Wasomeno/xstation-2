"""Section catalog the Station Agent is allowed to Show."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Section:
    id: str
    label: str
    aliases: tuple[str, ...]


SECTIONS: tuple[Section, ...] = (
    Section("hero", "Hero", ("home", "top", "start", "beginning", "gateway", "root", "beranda", "halaman awal")),
    Section("system", "The System Behind Every Agent", ("the system behind", "NADI system", "how NADI works", "ecosystem", "ekosistem NADI", "sistem NADI", "cara kerja NADI", "arsitektur NADI")),
    Section("work", "Products", ("products", "solutions", "AI products", "explore", "catalog", "index", "what you can do", "produk", "solusi", "daftar produk")),
    Section("bikinkonten", "BikinKonten", ("bikin konten", "content", "marketing", "social", "workspace konten gambar dan video")),
    Section("lubna", "Lubna", ("brand", "social content", "asisten pemasaran lewat chat", "brief sampai publikasi konten")),
    Section("crm-ai-agent", "CRM AI Agent", ("crm", "whatsapp", "customer agent", "ai agent", "layanan pelanggan", "customer service")),
    Section("hireassess", "HireAssess", ("hire assess", "hiring", "talent", "assessment", "hr", "rekrut", "rekrutmen", "penilaian kandidat")),
    Section("arkiv", "Arkiv", ("archive", "document", "documents", "files", "dokumen", "arsip", "manajemen dokumen")),
    Section("codev", "CoDev", ("code", "developer", "engineering", "coding", "pengembangan software")),
    Section("coframe", "CoFrame", ("prototype", "prototyping", "wireframe", "prototipe")),
    Section("cofinance", "CoFinance", ("finance", "cashflow", "invoice", "keuangan", "arus kas")),
    Section("clients", "Clients", ("trusted by", "logos", "customers", "klien")),
    Section("contact", "Contact", ("book", "talk", "get in touch", "discuss", "reach out", "schedule a demo", "schedule demo", "qr", "email", "hubungi", "menghubungi", "kontak", "diskusi", "bicara", "berbicara", "jadwalkan demo", "menjadwalkan demo")),
)

SECTION_IDS = tuple(section.id for section in SECTIONS)
SECTION_BY_ID = {section.id: section for section in SECTIONS}
PRODUCT_IDS = frozenset(SECTION_IDS) - {"hero", "system", "work", "clients", "contact"}

_ALIAS_TO_ID = {}
for section in SECTIONS:
    _ALIAS_TO_ID[section.id] = section.id
    _ALIAS_TO_ID[section.label.lower()] = section.id
    for alias in section.aliases:
        _ALIAS_TO_ID[alias.lower()] = section.id


def resolve_section(name: str | None) -> str | None:
    if not name:
        return None
    key = " ".join(str(name).strip().lower().replace("_", " ").replace("#", "").split())
    if key in _ALIAS_TO_ID:
        return _ALIAS_TO_ID[key]
    compact = key.replace(" ", "-")
    if compact in SECTION_BY_ID:
        return compact
    compact_nosep = key.replace(" ", "").replace("-", "")
    for section in SECTIONS:
        if section.id.replace("-", "") == compact_nosep:
            return section.id
        if section.label.lower().replace(" ", "") == compact_nosep:
            return section.id
    return None


def catalog_for_prompt() -> str:
    lines = []
    for section in SECTIONS:
        alias = ", ".join(section.aliases)
        lines.append(f"- {section.id} ({section.label}): {alias}")
    return "\n".join(lines)
