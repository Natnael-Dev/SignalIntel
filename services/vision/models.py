"""Pydantic data models for Vision Intelligence, Scene Classification, and OCR."""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class OcrBoundingBox(BaseModel):
    """Bounding box coordinates and confidence for an OCR-detected word."""
    x0: int = Field(..., description="Left coordinate")
    y0: int = Field(..., description="Top coordinate")
    x1: int = Field(..., description="Right coordinate")
    y1: int = Field(..., description="Bottom coordinate")
    conf: float = Field(..., description="OCR confidence score (0.0 to 100.0)")
    word: str = Field(..., description="Recognized text token")


class OcrResult(BaseModel):
    """Aggregated OCR output containing full extracted text and word boxes."""
    text: str = Field(default="", description="Consolidated ticker or lower-third text")
    boxes: List[OcrBoundingBox] = Field(default_factory=list, description="List of recognized word bounding boxes")


class SceneClassification(BaseModel):
    """Scene classification payload returned by the Vision LLM."""
    scene_type: str = Field(
        default="unknown",
        description="Classified scene category: program | commercial | breaking_news | other | unknown",
    )
    confidence: float = Field(default=0.0, description="Confidence level between 0.0 and 1.0")
    description: str = Field(default="", description="Visual summary description of the scene")


class VisionEvent(BaseModel):
    """Real-time broadcast event combining Scene Classification and Ticker OCR."""
    stream_id: str
    channel_name: str
    timestamp: float = Field(..., description="Stream timestamp offset in seconds")
    frame_path: str = Field(..., description="Path to the source extracted video frame")
    scene_type: str = Field(default="unknown", description="program | commercial | breaking_news | other | unknown")
    confidence: float = Field(default=0.0, description="Scene classification confidence score")
    ticker_text: Optional[str] = Field(default=None, description="Extracted lower-third text if present")
    ocr_box_count: int = Field(default=0, description="Total detected OCR bounding boxes in ticker region")
    description: Optional[str] = Field(default=None, description="Visual description from Vision LLM")
    event_type: str = Field(default="vision_update", description="WebSocket message event type")
    emitted_at: datetime = Field(default_factory=datetime.utcnow, description="UTC event creation timestamp")
