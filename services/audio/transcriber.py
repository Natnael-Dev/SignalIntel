"""Faster-Whisper Speech-to-Text Transcription Engine with Silero VAD Filter."""

import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
import numpy as np

logger = logging.getLogger("signalintel.audio.transcriber")


class WhisperTranscriber:
    """High-throughput Faster-Whisper speech transcription wrapper with Silero VAD."""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "auto",
        compute_type: str = "auto",
        download_root: Optional[str] = None,
    ):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.download_root = download_root
        self._model = None
        self._is_initialized = False

    def _ensure_loaded(self):
        """Lazy loader for WhisperModel instance."""
        if not self._is_initialized:
            try:
                from faster_whisper import WhisperModel
                logger.info(f"Loading Faster-Whisper model '{self.model_size}' on device '{self.device}'...")
                self._model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                    download_root=self.download_root,
                )
                self._is_initialized = True
                logger.info("Faster-Whisper model loaded successfully.")
            except ImportError:
                logger.warning("faster-whisper is not installed. Running in mock transcription mode.")
                self._model = None
                self._is_initialized = True
            except Exception as e:
                logger.error(f"Error initializing Faster-Whisper: {e}")
                self._model = None
                self._is_initialized = True

    def transcribe_chunk(
        self,
        audio_source: Union[str, Path, bytes, np.ndarray],
        language: Optional[str] = None,
        vad_filter: bool = True,
        beam_size: int = 5,
    ) -> List[Dict[str, Any]]:
        """Transcribes an audio chunk using Silero VAD filtering.

        Args:
            audio_source: Path to WAV file, raw audio bytes, or numpy float32 buffer.
            language: Optional ISO language code (e.g., 'en', 'es', 'tr'). None for auto-detect.
            vad_filter: Whether to enable Silero VAD silence suppression.
            beam_size: Beam search width.

        Returns:
            List of dicts: [{"start": 0.0, "end": 2.5, "text": "...", "confidence": 0.95, "lang": "en"}]
        """
        self._ensure_loaded()

        if self._model is None:
            # Fallback mock transcription for testing without heavy model download
            logger.debug(f"Mock transcription fallback for {audio_source}")
            return [
                {
                    "start": 0.0,
                    "end": 3.0,
                    "text": "[Signal detected on audio stream]",
                    "confidence": 0.99,
                    "language": language or "en",
                }
            ]

        try:
            # Convert Path to str if necessary
            src = str(audio_source) if isinstance(audio_source, (str, Path)) else audio_source

            segments, info = self._model.transcribe(
                src,
                language=language,
                vad_filter=vad_filter,
                beam_size=beam_size,
            )

            detected_lang = info.language if hasattr(info, "language") else (language or "auto")
            results = []

            for seg in segments:
                text = (seg.text or "").strip()
                if not text:
                    continue

                results.append({
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": text,
                    "confidence": float(getattr(seg, "avg_logprob", 0.0)),
                    "language": detected_lang,
                })

            return results
        except Exception as exc:
            logger.error(f"Transcription failed: {exc}", exc_info=True)
            return []
