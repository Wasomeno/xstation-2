import unittest
from html.parser import HTMLParser
from pathlib import Path

from decide import decide, decide_from_model_text, parse_model_json
from sections import SECTION_IDS


class ParseModelJsonTests(unittest.TestCase):
    def test_reads_plain_object(self):
        payload = parse_model_json('{"action":"show","section":"arkiv"}')
        self.assertEqual(payload["section"], "arkiv")

    def test_reads_fenced_json(self):
        payload = parse_model_json("```json\n{\"action\":\"show\",\"section\":\"contact\"}\n```")
        self.assertEqual(payload["section"], "contact")

    def test_rejects_prose(self):
        self.assertIsNone(parse_model_json("Arkiv keeps documents in one workspace."))


class DecideTests(unittest.TestCase):
    def test_catalog_destinations_exist_in_the_landing_page(self):
        ids = set()
        sections = set()

        class Page(HTMLParser):
            def handle_starttag(self, tag, attrs):
                ids.add(dict(attrs).get("id"))
                if tag == "section" and dict(attrs).get("id"):
                    sections.add(dict(attrs)["id"])

        Page().feed((Path(__file__).resolve().parents[2] / "index.html").read_text())
        self.assertFalse(set(SECTION_IDS) - ids)
        self.assertEqual(set(SECTION_IDS), sections)

    def test_system_section_is_navigable_but_not_a_product_contact(self):
        for alias in ("system", "The System Behind Every Agent", "ekosistem NADI"):
            self.assertEqual(decide({"action": "show", "section": alias}),
                             {"action": "show", "section": "system"})
        self.assertEqual(decide({"action": "contact", "section": "system"}, "hubungi tim")["action"], "clarify")

    def test_removed_poc_actions_are_rejected(self):
        for target in ("bikinkonten-demo", "talk-to-us"):
            self.assertEqual(decide({"action": "activate", "target": target})["action"], "clarify")

    def test_show_known_section(self):
        self.assertEqual(
            decide({"action": "show", "section": "hireassess"}),
            {"action": "show", "section": "hireassess"},
        )

    def test_show_alias(self):
        self.assertEqual(
            decide({"action": "show", "section": "hiring"}),
            {"action": "show", "section": "hireassess"},
        )

    def test_unknown_section_clarifies(self):
        result = decide({"action": "show", "section": "pricing"})
        self.assertEqual(result["action"], "clarify")
        self.assertEqual(result["hypotheses"], [])

    def test_single_hypothesis_keeps_model_uncertainty(self):
        self.assertEqual(
            decide({"action": "clarify", "hypotheses": ["HireAssess"], "text": "HireAssess?"}),
            {"action": "clarify", "hypotheses": ["hireassess"], "text": "HireAssess?"},
        )

    def test_only_explicit_show_can_navigate(self):
        for payload in (
            {"section": "arkiv"},
            {"action": "answer", "section": "arkiv"},
            {"action": "noop", "section": "arkiv", "hypotheses": ["arkiv"]},
            {"action": "show", "hypotheses": ["arkiv"]},
        ):
            with self.subTest(payload=payload):
                self.assertNotEqual(decide(payload, "apa itu Arkiv?")["action"], "show")

    def test_hero_is_never_a_default_destination(self):
        for transcript in (None, "halo", "mulai", "lanjut", "apa itu Arkiv?", "superhero"):
            with self.subTest(transcript=transcript):
                self.assertNotEqual(decide({"action": "show", "section": "root"}, transcript)["action"], "show")

    def test_explicit_request_can_return_to_hero(self):
        for transcript in ("kembali ke beranda", "ke halaman awal", "balik ke atas", "go to the top", "home"):
            with self.subTest(transcript=transcript):
                self.assertEqual(decide({"action": "show", "section": "hero"}, transcript), {"action": "show", "section": "hero"})

    def test_negated_hero_request_does_not_navigate(self):
        for transcript in ("jangan ke hero", "jangan kembali ke beranda", "don't go home"):
            with self.subTest(transcript=transcript):
                self.assertNotEqual(decide({"action": "show", "section": "hero"}, transcript)["action"], "show")

    def test_contact_aliases_match_whole_words(self):
        for transcript in ("notebook", "demografi", "stalking"):
            with self.subTest(transcript=transcript):
                self.assertNotEqual(decide({"action": "show", "section": "contact"}, transcript)["action"], "show")

    def test_noop_remains_a_noop(self):
        self.assertEqual(decide({"action": "noop"}, "terima kasih"), {"action": "noop"})

    def test_conflicting_show_destinations_do_not_navigate(self):
        result = decide({"action": "show", "section": "arkiv", "hypotheses": ["arkiv", "hireassess"]})
        self.assertEqual(result["action"], "clarify")

    def test_two_hypotheses_clarify(self):
        result = decide({
            "action": "clarify",
            "hypotheses": ["HireAssess", "Arkiv"],
            "text": "HireAssess, or Arkiv?",
        })
        self.assertEqual(result["action"], "clarify")
        self.assertEqual(result["hypotheses"], ["hireassess", "arkiv"])
        self.assertIn("HireAssess", result["text"])

    def test_answer_is_not_a_page_action(self):
        result = decide({"action": "answer", "text": "Arkiv keeps documents in one workspace."})
        self.assertEqual(result["action"], "clarify")
        self.assertNotIn("workspace", result["text"])

    def test_empty_payload_clarifies(self):
        result = decide(None)
        self.assertEqual(result["action"], "clarify")
        self.assertIn("ulangi", result["text"])

    def test_contact_show_without_asking_is_blocked(self):
        result = decide({"action": "show", "section": "contact"}, transcript="tell me a joke")
        self.assertEqual(result["action"], "clarify")
        self.assertNotEqual(result.get("section"), "contact")

    def test_contact_show_when_asked_is_allowed(self):
        result = decide({"action": "show", "section": "contact"}, transcript="mau book demo")
        self.assertEqual(result, {"action": "show", "section": "contact"})

    def test_showcase_actions_are_validated(self):
        for transcript, payload in (
            ("Go back.", {"action": "back"}),
            ("Go next.", {"action": "next"}),
            ("Go forward.", {"action": "next"}),
            ("What else can I explore?", {"action": "explore"}),
            ("I want to talk to your team.", {"action": "contact", "section": "contact"}),
            ("How can I get in touch?", {"action": "contact", "section": "contact"}),
            ("Saya ingin berbicara dengan tim Anda", {"action": "contact", "section": "contact"}),
            ("Bagaimana cara menghubungi tim kalian?", {"action": "contact", "section": "contact"}),
            ("Can I schedule a demo?", {"action": "contact", "section": "contact"}),
            ("Jadwalkan demo BikinKonten", {"action": "contact", "section": "bikinkonten"}),
            ("I'm interested in Product BikinKonten. I want discuss with the team", {"action": "contact", "section": "bikinkonten"}),
            ("Buka WhatsApp BikinKonten", {"action": "whatsapp", "section": "bikinkonten"}),
        ):
            with self.subTest(transcript=transcript):
                self.assertEqual(decide(payload, transcript), payload)
        self.assertEqual(decide({"action": "show", "section": "contact"}, "How can I get in touch?"),
                         {"action": "show", "section": "contact"})

    def test_showcase_actions_do_not_guess_or_accept_arbitrary_targets(self):
        for transcript, payload in (
            ("hello", {"action": "back"}),
            ("thank you", {"action": "next"}),
            ("CRM AI Agent", {"action": "contact", "section": "crm-ai-agent"}),
            ("Play the demo", {"action": "demo", "section": "pricing"}),
            ("Play the demo", {"action": "demo", "section": "hero"}),
            ("Play the demo", {"action": "demo", "section": "current"}),
            ("Play the BikinKonten demo", {"action": "demo", "section": "bikinkonten"}),
            ("Play the demo", {"action": "demo", "section": ["bikinkonten"]}),
            ("Talk to us", {"action": "contact", "section": "clients"}),
            ("Don't play the demo", {"action": "demo", "section": "bikinkonten"}),
            ("Jangan kembali", {"action": "back"}),
            ("I need WhatsApp customer service", {"action": "whatsapp", "section": "crm-ai-agent"}),
            ("Buka WhatsApp", {"action": "whatsapp", "section": "https://evil.test"}),
            ("Play the demo", {"action": "demo", "section": "arkiv", "hypotheses": ["bikinkonten"]}),
        ):
            with self.subTest(transcript=transcript):
                self.assertEqual(decide(payload, transcript)["action"], "clarify")

    def test_default_clarify_is_indonesian(self):
        result = decide({"action": "clarify", "hypotheses": ["HireAssess", "Arkiv"]})
        self.assertEqual(result["text"], "HireAssess, atau Arkiv?")

    def test_decide_from_model_text_round_trip(self):
        result = decide_from_model_text('{"action":"show","section":"bikin konten"}')
        self.assertEqual(result, {"action": "show", "section": "bikinkonten"})


if __name__ == "__main__":
    unittest.main()
