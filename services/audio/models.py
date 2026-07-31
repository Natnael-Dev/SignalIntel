"""Data models for Speech-to-Text Transcription and Translation."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    """A single transcribed and optionally translated speech segment."""
    index: int
    start_seconds: float
    end_seconds: float
    original_text: str
    translated_text: Optional[str] = None
    source_lang: str = "auto"
    target_lang: str = "en"
    confidence: float = 1.0
    srt_block: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TranscriptEvent(BaseModel):
    """Real-time broadcast event containing subtitle block and metadata."""
    stream_id: str
    channel_name: str
    chunk_index: int
    segment: TranscriptSegment
    event_type: str = "transcript_update"
    emitted_at: datetime = Field(default_factory=datetime.utcnow)
