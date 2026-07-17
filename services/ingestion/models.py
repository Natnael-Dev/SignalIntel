"""Pydantic data models for Stream Ingestion and Frame Capture."""

from datetime import datetime
from typing import Optional, List
import uuid
from pydantic import BaseModel, Field, HttpUrl


class StreamConfig(BaseModel):
    """Configuration for an active media ingestion stream."""
    stream_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    url: str = Field(..., description="RTSP, HLS, HTTP, or local file stream URL")
    channel_name: str = Field(default="live_stream", description="Identifier for the source channel")
    fps: float = Field(default=1.0, description="Video sampling frame rate in FPS")
    resolution: str = Field(default="1280:720", description="Target video resolution (WxH)")
    audio_sample_rate: int = Field(default=16000, description="Audio sample rate in Hz (16kHz for Whisper)")
    audio_chunk_duration: int = Field(default=10, description="Duration in seconds per audio processing chunk")
    target_lang: str = Field(default="en", description="Target language code for downstream translation")
    source_lang: Optional[str] = Field(default=None, description="Source language code (None = auto-detect)")
    save_frames: bool = Field(default=True, description="Whether to persist extracted image frames to disk")
    output_dir: Optional[str] = Field(default=None, description="Custom temporary/output storage path")


class FrameCapture(BaseModel):
    """Metadata for an extracted video frame."""
    stream_id: str
    channel_name: str
    frame_index: int
    timestamp_seconds: float
    captured_at: datetime = Field(default_factory=datetime.utcnow)
    file_path: Optional[str] = None
    width: int = 1280
    height: int = 720


class AudioChunk(BaseModel):
    """Metadata and payload for a segment of extracted audio."""
    stream_id: str
    channel_name: str
    chunk_index: int
    start_time_seconds: float
    end_time_seconds: float
    sample_rate: int = 16000
    channels: int = 1
    file_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StreamStatus(BaseModel):
    """Runtime status of an ingestion stream worker."""
    stream_id: str
    channel_name: str
    url: str
    status: str = Field(default="initializing", description="Status: initializing | active | reconnecting | stopped | error")
    frames_captured: int = 0
    audio_chunks_produced: int = 0
    started_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: Optional[datetime] = None
    error_message: Optional[str] = None
