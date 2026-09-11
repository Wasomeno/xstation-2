"""Section catalog the Station Agent is allowed to Show."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Section:
    id: str
    label: str
    aliases: tuple[str, ...]
    knowledge: str = ""


SECTIONS: tuple[Section, ...] = (
    Section("hero", "Hero", ("home", "top", "start", "beginning", "gateway", "root", "beranda", "halaman awal")),
    Section("system", "The System Behind Every Agent", ("the system behind", "NADI system", "how NADI works", "ecosystem", "ekosistem NADI", "sistem NADI", "cara kerja NADI", "arsitektur NADI"),
            "Layanan jaringan agent NADI untuk perusahaan. Ecosystem menghubungkan percakapan dan konteks antar-agent agar tools tidak terpisah. "
            "Build membangun agent sesuai proses kerja perusahaan, bukan template. Scale menambah agent, tim, dan beban kerja dalam jaringan yang sama. "
            "Govern menetapkan izin tindakan, persetujuan manusia, dan log yang dapat diaudit. Secure menjaga data dalam lingkungan perusahaan, termasuk model on-premise. "
            "Optimize mengukur waktu respons, akurasi, dan pengurangan beban kerja lalu meningkatkan performa. Managed berarti DOT mengoperasikan sistem setelah go-live: monitoring, insiden, pembaruan model, dan perubahan proses. "
            "Pilih untuk kebutuhan infrastruktur, integrasi, tata kelola, keamanan, atau pengoperasian agent; bukan produk CRM atau CTA kontak."),
    Section("work", "Products", ("products", "solutions", "AI products", "explore", "catalog", "index", "what you can do", "produk", "solusi", "daftar produk")),
    Section("bikinkonten", "BikinKonten", ("bikin konten", "content", "marketing", "social", "workspace konten gambar dan video"),
            "Workspace untuk merencanakan ide, membuat, dan mengelola gambar serta video AI untuk media sosial dengan identitas brand yang konsisten. "
            "Membantu produksi materi promosi rutin, kekurangan ide konten, dan pengelolaan konten beberapa brand. "
            "Rekomendasi awal untuk promosi, menarik pembeli, atau meningkatkan penjualan secara umum tanpa kendala yang lebih spesifik; tidak menjamin kenaikan penjualan. "
            "Pembeda: workspace produksi visual, bukan asisten chat sampai publikasi atau layanan percakapan pelanggan."),
    Section("lubna", "Lubna", ("brand", "social content", "asisten pemasaran lewat chat", "brief sampai publikasi konten"),
            "Asisten marketing melalui chat: menerima brief lalu membantu merencanakan, membuat, dan mempublikasikan konten media sosial sesuai brand. "
            "Cocok jika pengunjung ingin mendelegasikan alur brief sampai publikasi melalui percakapan sederhana. "
            "Pembeda dari BikinKonten adalah asisten lewat chat dan alur sampai publikasi; bukan bot untuk menjawab calon pembeli."),
    Section("crm-ai-agent", "CRM AI Agent", ("crm", "whatsapp", "customer agent", "ai agent", "layanan pelanggan", "customer service"),
            "Agent layanan pelanggan WhatsApp yang menjawab pertanyaan produk dan melayani prospek secara instan, konsisten, 24/7. "
            "Cocok untuk pertanyaan berulang, respons admin lambat, pesan di luar jam kerja, dan peluang penjualan hilang karena calon pembeli tidak terlayani. "
            "Pembeda: percakapan pelanggan, bukan pembuatan materi promosi, chatbot marketing internal, atau logo klien."),
    Section("hireassess", "HireAssess", ("hire assess", "hiring", "talent", "assessment", "hr", "rekrut", "rekrutmen", "penilaian kandidat"),
            "Penilaian kandidat teknis melalui pekerjaan nyata dan respons praktis untuk melihat kemampuan, bukan hanya CV. "
            "Membantu screening dan membandingkan kandidat secara lebih cepat, konsisten, dan objektif. "
            "Pembeda dari CoDev: menilai kemampuan pelamar, bukan mengerjakan kode proyek."),
    Section("arkiv", "Arkiv", ("archive", "document", "documents", "files", "dokumen", "arsip", "manajemen dokumen", "company knowledge", "knowledge management", "pengetahuan perusahaan"),
            "Workspace dokumen bisnis yang aman: mengatur berkas, hak akses, versi, persetujuan, dan pencarian informasi dengan AI. "
            "Cocok untuk arsip tersebar, sulit mencari informasi, salah versi dokumen, dan kontrol persetujuan berkas; menyimpan, mengatur, dan mengakses pengetahuan perusahaan dari satu tempat. "
            "Pembeda: pengelolaan dokumen; proyeksi arus kas adalah CoFinance dan kebijakan tindakan agent adalah System."),
    Section("codev", "CoDev", ("code", "developer", "engineering", "coding", "pengembangan software"),
            "Agent pengembangan software yang menerima issue/tugas, menulis kode, membuat merge request, menanggapi review, dan memperbaiki masalah sampai siap di-merge. "
            "Membantu backlog bug, implementasi fitur, dan pekerjaan developer yang lambat. "
            "Pembeda: mengerjakan kode proyek nyata; validasi ide dengan prototipe interaktif adalah CoFrame."),
    Section("coframe", "CoFrame", ("prototype", "prototyping", "wireframe", "prototipe"),
            "Mengubah deskripsi ide menjadi prototipe web interaktif untuk dieksplorasi, disempurnakan, dan divalidasi sebelum development. "
            "Cocok untuk mencoba alur aplikasi atau konsep dengan calon pengguna sebelum membangun software penuh. "
            "Pembeda dari CoDev: validasi konsep lewat prototipe, bukan implementasi issue di proyek produksi."),
    Section("cofinance", "CoFinance", ("finance", "cashflow", "invoice", "keuangan", "arus kas"),
            "Agent keuangan yang menghubungkan milestone proyek, invoice/collection, dan proyeksi cashflow untuk memantau likuiditas, mengantisipasi risiko, dan membantu keputusan finansial. "
            "Cocok untuk melacak data keuangan, pembayaran tertunda, arus kas, dan memperkirakan kecukupan dana. "
            "Pembeda: proses dan analisis keuangan, bukan arsip dokumen atau promosi untuk menaikkan penjualan."),
    Section("clients", "Trusted by", ("trusted by", "logos", "customers", "klien", "track record", "rekam jejak", "referensi klien", "Pamapersada Nusantara", "PAMA", "Hakuhodo Indonesia", "Universitas Brawijaya", "UB", "Collins Property Group", "Meet and Move", "Bina", "Qasir"),
            "Section bukti kepercayaan/rekam jejak berisi logo Pamapersada Nusantara, Hakuhodo Indonesia, Universitas Brawijaya (UB), Collins Property Group, Meet and Move, Bina, dan Qasir. "
            "Pilih saat pengunjung bertanya siapa klien NADI, perusahaan yang sudah memakai solusi, atau ingin melihat track record. "
            "Pembeda: melihat referensi klien NADI; kebutuhan mengelola pelanggan milik pengunjung adalah CRM AI Agent."),
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
        if section.knowledge:
            lines.append(f"  Kemampuan dan kecocokan: {section.knowledge}")
    return "\n".join(lines)
