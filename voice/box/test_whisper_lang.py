import unittest

from whisper_lang import is_foreign_language, resolve_asr_language


class ResolveAsrLanguageTests(unittest.TestCase):
    def test_decode_is_always_indonesian(self):
        self.assertEqual(resolve_asr_language("en", 0.99), "id")
        self.assertEqual(resolve_asr_language("zh", 0.95), "id")
        self.assertEqual(resolve_asr_language("id", 0.1), "id")


class ForeignLanguageTests(unittest.TestCase):
    def test_indonesian_is_not_foreign(self):
        self.assertFalse(is_foreign_language("id", 0.4))

    def test_malay_is_not_foreign(self):
        self.assertFalse(is_foreign_language("ms", 0.99))

    def test_weak_english_misdetect_is_not_foreign(self):
        top = [("en", 0.62), ("tl", 0.12), ("id", 0.11), ("ms", 0.08)]
        self.assertFalse(is_foreign_language("en", 0.62, top))

    def test_confident_english_is_foreign(self):
        self.assertTrue(is_foreign_language("en", 0.9, [("en", 0.9), ("id", 0.04)]))

    def test_confident_chinese_is_foreign(self):
        self.assertTrue(is_foreign_language("zh", 0.95, [("zh", 0.95), ("id", 0.01)]))

    def test_id_mass_keeps_clip_local(self):
        top = [("en", 0.8), ("id", 0.15), ("ms", 0.1)]
        self.assertFalse(is_foreign_language("en", 0.8, top))
