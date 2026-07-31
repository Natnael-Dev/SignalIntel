"""Audio Intelligence Pipeline: Faster-Whisper + Google Translate + SRT Subtitle Formatter."""

import logging
from datetime import timedelta
from typing import List, Optional, Union
from pathlib import Path
import srt

from services.audio.models import TranscriptSegment, TranscriptEvent
from services.audio.transcriber import WhisperTranscriber
from services.audio.translator import SubtitlesTranslator

logger = logging.getLogger("signalintel.audio.pipeline")


class AudioIntelligencePipeline:
    """Orchestrates end-to-end Speech Transcription, Translation, and Subtitle Generation."""

    def __init__(
        self,
        model_size: str = "base",
        default_target_lang: str = "en",
    ):
        self.transcriber = WhisperTranscriber(model_size=model_size)
        self.translator = SubtitlesTranslator(default_target=default_target_lang)
        self._global_subtitle_index = 1

    def process_audio_chunk(
        self,
        audio_source: Union[str, Path, bytes],
        start_offset_seconds: float = 0.0,
        target_lang: str = "en",
        source_lang: Optional[str] = None,
        translate: bool = True,
    ) -> List[TranscriptSegment]:
        """Transcribes an audio chunk, applies translation, and formats into SRT blocks.

        Args:
            audio_source: WAV file path or raw audio bytes.
            start_offset_seconds: Base timestamp offset for the chunk in the live stream.
            target_lang: Target language code for translation.
            source_lang: Source language code (None = auto-detect).
            translate: Whether to run text translation.

        Returns:
            List of TranscriptSegment objects containing original text, translated text, and SRT string.
        """
        raw_segments = self.transcriber.transcribe_chunk(
            audio_source=audio_source,
            language=source_lang,
            vad_filter=True,
        )

        if not raw_segments:
            return []

        # Batch translate extracted text lines if enabled
        original_texts = [seg["text"] for seg in raw_segments]
        detected_lang = raw_segments[0].get("language", "auto")

        if translate and detected_lang != target_lang:
            translated_texts = self.translator.translate_batch(
                original_texts,
                source=detected_lang,
                target=target_lang,
            )
        else:
            translated_texts = original_texts

        output_segments: List[TranscriptSegment] = []

        for idx, (raw_seg, translated_txt) in enumerate(zip(raw_segments, translated_texts)):
            abs_start = start_offset_seconds + raw_seg["start"]
            abs_end = start_offset_seconds + raw_seg["end"]

            # Guard against invalid negative or reversed timestamps
            if abs_end <= abs_start:
                abs_end = abs_start + 0.5

            # Compose formatted SRT subtitle block
            sub_index = self._global_subtitle_index
            self._global_subtitle_index += 1

            sub_item = srt.Subtitle(
                index=sub_index,
                start=timedelta(seconds=abs_start),
                end=timedelta(seconds=abs_end),
                content=f"{raw_seg['text']}\n{translated_txt}" if translate and raw_seg['text'] != translated_txt else raw_seg['text'],
            )
            srt_block = srt.compose([sub_item]).strip()

            segment = TranscriptSegment(
                index=sub_index,
                start_seconds=abs_start,
                end_seconds=abs_end,
                original_text=raw_seg["text"],
                translated_text=translated_txt if translate else None,
                source_lang=detected_lang,
                target_lang=target_lang,
                confidence=raw_seg.get("confidence", 1.0),
                srt_block=srt_block,
            )
            output_segments.append(segment)

        return output_segments
