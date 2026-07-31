"""Translation layer wrapping deep-translator (Google Translate scraper) with batching and fallback."""

import logging
from typing import List, Optional

logger = logging.getLogger("signalintel.audio.translator")


class SubtitlesTranslator:
    """Multilingual text translator supporting single and batch translations."""

    def __init__(self, default_target: str = "en"):
        self.default_target = default_target
        self._translator_cache = {}

    def _get_translator(self, source: str, target: str):
        key = f"{source}->{target}"
        if key not in self._translator_cache:
            try:
                from deep_translator import GoogleTranslator
                self._translator_cache[key] = GoogleTranslator(source=source, target=target)
            except ImportError:
                logger.warning("deep-translator is not installed.")
                self._translator_cache[key] = None
        return self._translator_cache.get(key)

    def translate_text(
        self,
        text: str,
        source: str = "auto",
        target: Optional[str] = None,
    ) -> str:
        """Translates a single text string."""
        target_lang = target or self.default_target
        text = text.strip()
        if not text:
            return ""

        if source == target_lang:
            return text

        translator = self._get_translator(source, target_lang)
        if translator is None:
            return text

        try:
            translated = translator.translate(text)
            return translated or text
        except Exception as exc:
            logger.warning(f"Translation failed for '{text[:40]}...': {exc}; returning original text.")
            return text

    def translate_batch(
        self,
        texts: List[str],
        source: str = "auto",
        target: Optional[str] = None,
    ) -> List[str]:
        """Translates a batch of subtitle strings with per-line fallback."""
        target_lang = target or self.default_target
        if not texts:
            return []

        if source == target_lang:
            return texts

        translator = self._get_translator(source, target_lang)
        if translator is None:
            return texts

        # Try batch translation first
        try:
            batch_result = translator.translate_batch(texts)
            if batch_result and len(batch_result) == len(texts):
                return [t or orig for t, orig in zip(batch_result, texts)]
        except Exception as exc:
            logger.debug(f"Batch translation failed ({exc}); falling back to line-by-line translation.")

        # Fallback to line-by-line
        results = []
        for t in texts:
            results.append(self.translate_text(t, source=source, target=target_lang))
        return results
