import unittest

from whisper_lang import resolve_asr_language


class ResolveAsrLanguageTests(unittest.TestCase):
    def test_none_is_indonesian(self):
        self.assertEqual(resolve_asr_language(None, None), "id")

    def test_malay_is_indonesian(self):
        self.assertEqual(resolve_asr_language("ms", 0.99), "id")

    def test_javanese_is_indonesian(self):
        self.assertEqual(resolve_asr_language("jw", 0.9), "id")

    def test_chinese_is_indonesian(self):
        self.assertEqual(resolve_asr_language("zh", 0.95), "id")

    def test_indonesian_stays(self):
        self.assertEqual(resolve_asr_language("id", 0.4), "id")

    def test_confident_english_is_kept(self):
        self.assertEqual(resolve_asr_language("en", 0.9), "en")

    def test_weak_english_is_indonesian(self):
        self.assertEqual(resolve_asr_language("en", 0.5), "id")
