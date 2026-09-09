import unittest

from decide import decide, decide_from_model_text, parse_model_json


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

    def test_single_hypothesis_is_a_show(self):
        self.assertEqual(
            decide({"action": "clarify", "hypotheses": ["HireAssess"], "text": "HireAssess?"}),
            {"action": "show", "section": "hireassess"},
        )

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

    def test_decide_from_model_text_round_trip(self):
        result = decide_from_model_text('{"action":"show","section":"bikin konten"}')
        self.assertEqual(result, {"action": "show", "section": "bikinkonten"})


if __name__ == "__main__":
    unittest.main()
