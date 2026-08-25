"""Unit tests for Audio Intelligence Pipeline and SRT Subtitle Formatter."""

import pytest
import io
import wave
import struct
import srt
from datetime import timedelta

from services.audio.models import TranscriptSegment
from services.audio.transcriber import WhisperTranscriber
from services.audio.translator import SubtitlesTranslator
from services.audio.pipeline import AudioIntelligencePipeline


def create_dummy_wav_bytes(duration_seconds=1.0, sample_rate=16000) -> bytes:
    """Generates an in-memory 16kHz mono 16-bit PCM WAV chunk."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        # Generate 1 sec of silence / low-amplitude tone
        num_frames = int(duration_seconds * sample_rate)
        data = struct.pack(f"<{num_frames}h", *[0] * num_frames)
        wf.writeframes(data)
    return buffer.getvalue()


def test_transcriber_fallback():
    """Verify transcriber gracefully handles audio chunks."""
    transcriber = WhisperTranscriber(model_size="tiny")
    wav_bytes = create_dummy_wav_bytes(2.0)
    segments = transcriber.transcribe_chunk(wav_bytes)
    assert isinstance(segments, list)


def test_translator_fallback():
    """Verify translator handles text pass-through and caching."""
    translator = SubtitlesTranslator(default_target="en")
    result = translator.translate_text("Breaking news: Live coverage starts now.", source="en", target="en")
    assert result == "Breaking news: Live coverage starts now."

    batch = translator.translate_batch(["Headline one", "Headline two"], source="en", target="en")
    assert len(batch) == 2
    assert batch[0] == "Headline one"


def test_audio_pipeline_srt_formatting():
    """Verify end-to-end SRT generation with timestamps."""
    pipeline = AudioIntelligencePipeline()
    wav_bytes = create_dummy_wav_bytes(3.0)
    
    segments = pipeline.process_audio_chunk(
        audio_source=wav_bytes,
        start_offset_seconds=10.0,
        target_lang="en",
    )
    
    assert len(segments) > 0
    seg = segments[0]
    assert seg.start_seconds >= 10.0
    assert seg.end_seconds > seg.start_seconds
    assert "-->" in seg.srt_block
    
    # Parse generated SRT to verify standards compliance
    parsed = list(srt.parse(seg.srt_block))
    assert len(parsed) == 1
    assert parsed[0].start >= timedelta(seconds=10.0)


def test_vad_silence_suppression_mock():
    """Verify handling of empty or silent transcript segments."""
    pipeline = AudioIntelligencePipeline()
    empty_bytes = b""
    segments = pipeline.process_audio_chunk(empty_bytes)
    assert isinstance(segments, list)

