"""Live DeepSeek regression checks; run explicitly, never in offline unit tests."""

import argparse
import asyncio
import json

from server import interpret


# Product descriptions take precedence over CSV (1) targets; demo commands use the page player.
# Expected decisions are independent of the production prompt. None means no section.
CAKE = "Aku punya bisnis jual beli cake dan ingin meningkatkan penjualan, kira kira saya harus pakai service mana?"
CASES = {
    "cake": [(CAKE, "show", "bikinkonten")] * 3,
    "showcase": [
        ("Show me the solutions.", "show", "work"),
        ("Take me to the contact section.", "contact", "contact"),
        ("Go back.", "back", None),
        ("Take me to the top.", "show", "hero"),
        ("Go home.", "show", "hero"),
        ("What else can I explore?", "explore", None),
        ("Show me the BikinKonten.", "show", "bikinkonten"),
        ("Show me what CODEV can do.", "show", "codev"),
        ("Show me what ARKIV can do.", "show", "arkiv"),
        ("Show me your AI products.", "show", "work"),
        ("I want to see the demo.", "demo", "current"),
        ("Play the demo.", "demo", "current"),
        ("I want to automate my customer operations.", "show", "crm-ai-agent"),
        ("I need something to help manage my customers.", "show", "crm-ai-agent"),
        ("I need help coming up with content ideas.", "show", "bikinkonten"),
        ("I have to create a lot of marketing content every week.", "show", "bikinkonten"),
        ("I need help screening candidates.", "show", "hireassess"),
        ("I want to find the right candidates faster.", "show", "hireassess"),
        ("I want AI to help my developers build faster.", "show", "codev"),
        ("I want to reduce the time it takes to build features on my project development", "show", "codev"),
        ("I want to make our financial processes more efficient.", "show", "cofinance"),
        ("I need help keeping track of our financial data.", "show", "cofinance"),
        ("I need help managing my documents.", "show", "arkiv"),
        ("I need to find information from our documents quickly.", "show", "arkiv"),
        ("I need a better way to store and access our knowledge.", "show", "arkiv"),
        ("I want to organize our company knowledge in one place.", "show", "arkiv"),
        ("I want to turn my concepts into something I can show my client.", "show", "coframe"),
        ("I need help turning ideas into a working prototype.", "show", "coframe"),
        ("Who are your clients?", "show", "clients"),
        ("Who is already using your solutions?", "show", "clients"),
        ("I want to see your track record.", "show", "clients"),
        ("Show me the system behind the agents.", "show", "system"),
        ("How do your agents work?", "show", "system"),
        ("I want to understand how your agents are built.", "show", "system"),
        ("I want to talk to your team.", "contact", "contact"),
        ("How can I get in touch?", "contact", "contact"),
        ("I’m interested in Product BikinKonten. I want discuss with the team", "contact", "bikinkonten"),
        ("I’m interested in Product CoFinance. I want discuss with the team", "contact", "cofinance"),
    ],
    # Held-out language: do not copy these sentences into the production prompt.
    "implicit": [
        ("Toko bunga saya sepi, ingin lebih banyak orang tertarik belanja. Ada yang cocok?", "show", "bikinkonten"),
        ("My bakery needs more sales. Which of your services would be a good starting point?", "show", "bikinkonten"),
        ("Foto dan video katalog baju kami beda-beda gayanya, ingin bikin materi Instagram yang konsisten.", "show", "bikinkonten"),
        ("I run three brands and need one place to plan and produce their social visuals.", "show", "bikinkonten"),
        ("Saya pengen cukup ngobrol kasih arahan, nanti asisten yang menyiapkan sampai posting promosi toko saya.", "show", "lubna"),
        ("Can I message an assistant with a campaign brief and have it prepare and publish the posts?", "show", "lubna"),
        ("Penjualan cake saya hilang karena calon pembeli nanya tengah malam dan admin baru jawab besok pagi.", "show", "crm-ai-agent"),
        ("Shoppers keep asking about sizes and availability on WhatsApp while our staff are asleep.", "show", "crm-ai-agent"),
        ("CV programmer kelihatan bagus semua, tapi saya ingin tahu siapa yang benar-benar bisa mengerjakan tugasnya.", "show", "hireassess"),
        ("We need a fair way to compare engineering applicants using practical work instead of resumes.", "show", "hireassess"),
        ("Tim sering salah pakai versi kontrak, susah cari berkas terbaru yang sudah disetujui.", "show", "arkiv"),
        ("Our files are scattered and everyone has access; I need controlled permissions and document approvals.", "show", "arkiv"),
        ("Backlog bug numpuk, ingin ada yang ngerjain tiket sampai perubahan kodenya siap direview.", "show", "codev"),
        ("Our engineers spend too long implementing tickets and addressing merge request feedback.", "show", "codev"),
        ("Punya ide aplikasi tapi sebelum bayar development saya mau calon pengguna coba alurnya dulu.", "show", "coframe"),
        ("I need a clickable version of my web app idea to validate it before writing production code.", "show", "coframe"),
        ("Tagihan proyek belum cair tapi pengeluaran jalan terus, ingin tahu kapan saldo bakal menipis.", "show", "cofinance"),
        ("Can overdue collections and project milestones help us predict whether we can cover next month's expenses?", "show", "cofinance"),
        ("Tools tiap divisi jalan sendiri-sendiri, ingin agent saling berbagi konteks dalam satu jaringan.", "show", "system"),
        ("Our workflow is unusual; can the agents be built around the way our company already operates?", "show", "system"),
        ("Kalau tim dan beban kerja bertambah, saya ingin menambah agent tanpa bikin sistem baru lagi.", "show", "system"),
        ("We need human approval before an agent acts and an audit trail afterwards.", "show", "system"),
        ("Kebijakan perusahaan mengharuskan model dan data operasional tetap di server sendiri.", "show", "system"),
        ("How do you measure agent accuracy and response time, then improve what performs poorly?", "show", "system"),
        ("Setelah go-live siapa yang menangani insiden, monitoring dan pembaruan model?", "show", "system"),
        ("Perusahaan mana saja yang sudah memakai layanan kalian?", "show", "clients"),
        ("I'd like to see which businesses have trusted your team.", "show", "clients"),
        ("Pengetahuan perusahaan tersebar di banyak tempat, pengen tim gampang mengaksesnya dari satu tempat.", "show", "arkiv"),
        ("Our internal knowledge is hard to locate; I need it organized and accessible to the team.", "show", "arkiv"),
    ],
    "video": [
        ("Putar video demo BikinKonten", "demo", "bikinkonten"),
        ("Show me the Lubna demo", "demo", "lubna"),
        ("Play the demo", "demo", "current"),
        ("See demo", "demo", "current"),
        ("Pause the video", "video_pause", None),
        ("Lanjutkan video", "video_resume", None),
        ("Ulangi videonya dari awal", "video_restart", None),
        ("Close the demo", "video_close", None),
        ("Jadwalkan demo Lubna", "contact", "lubna"),
        ("Play the CoDev demo", "noop", None),
        ("Jangan putar demo", "noop", None),
        ("Show me your work with Universitas Brawijaya", "show", "clients"),
    ],
    "safety": [
        ("Halo, selamat pagi", "noop", None),
        ("Thank you, that's all.", "noop", None),
        ("Saya butuh jasa memperbaiki oven kue yang rusak.", "noop", None),
        ("Can you deliver a chocolate cake to my house tomorrow?", "noop", None),
        ("Saya hanya mau resep cake, bukan layanan promosi atau aplikasi.", "noop", None),
        ("Jangan ke beranda", "noop", None),
        ("Don't show BikinKonten", "noop", None),
        ("Saya tidak mau melihat produk apa pun", "noop", None),
        ("Don't open WhatsApp", "noop", None),
        ("Saya bukan butuh konten, masalahnya pesan pembeli WhatsApp tidak terjawab saat malam.", "show", "crm-ai-agent"),
        ("Go next", "next", None),
        ("Next", "next", None),
        ("Next service", "next", None),
        ("Service berikutnya", "next", None),
        ("Go forward", "next", None),
        ("Buka WhatsApp BikinKonten", "whatsapp", "bikinkonten"),
        ("Show me the CRM AI Agent.", "show", "crm-ai-agent"),
    ],
}


async def evaluate(group):
    cases = [(name, *case) for name, rows in CASES.items() if group in ("all", name) for case in rows]
    limit = asyncio.Semaphore(3)

    async def check(name, transcript, action, section):
        expected = {"action": action}
        if section is not None:
            expected["section"] = section
        try:
            async with limit:
                # Match the live stream's interpretation deadline.
                result = await asyncio.wait_for(interpret(transcript), timeout=12)
            passed = result == expected
            detail = json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            passed = False
            detail = type(exc).__name__
        print(f"{'PASS' if passed else 'FAIL'} [{name}] {transcript} -> {detail}", flush=True)
        return passed

    results = await asyncio.gather(*(check(*case) for case in cases))
    print(f"{sum(results)}/{len(results)} passed", flush=True)
    return all(results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sends the fixed eval cases and catalog prompt to the configured DeepSeek API.")
    parser.add_argument("--group", choices=["all", *CASES], default="all")
    args = parser.parse_args()
    raise SystemExit(0 if asyncio.run(evaluate(args.group)) else 1)
