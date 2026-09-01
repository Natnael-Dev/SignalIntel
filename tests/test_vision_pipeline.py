"""Unit & Integration Tests for Vision Intelligence, Ticker Cropper, and OCR Pipeline."""

import os
import asyncio
from pathlib import Path
from unittest.mock import patch, AsyncMock
from PIL import Image, ImageDraw
import pytest

from services.vision.models import VisionEvent, OcrResult, OcrBoundingBox
from services.vision.ticker_crop import crop_lower_third
from services.vision.vision_llm import classify_frame, encode_image_to_base64
from services.vision.ocr_client import run_ocr
from services.vision.pipeline import VisionPipeline
from services.ingestion.models import FrameCapture


@pytest.fixture
def sample_frame_image(tmp_path) -> Path:
    """Creates a temporary synthetic 1280x720 broadcast frame with mock lower-third."""
    frame_file = tmp_path / "frame_000001.png"
    img = Image.new("RGB", (1280, 720), color=(30, 30, 40))
    draw = ImageDraw.Draw(img)

    # Draw simulated upper broadcast content
    draw.rectangle([100, 100, 1180, 450], fill=(60, 60, 80))
    # Draw simulated lower-third banner (y: 504 to 691)
    draw.rectangle([25, 504, 1254, 691], fill=(220, 20, 60))
    draw.text((50, 550), "BREAKING NEWS: LIVE BROADCAST TEST", fill=(255, 255, 255))

    img.save(frame_file, format="PNG")
    return frame_file


def test_crop_lower_third(sample_frame_image, tmp_path):
    """Verifies that crop_lower_third accurately extracts 70%-96% height and 2%-98% width."""
    out_dir = tmp_path / "crops"
    cropped_path = crop_lower_third(sample_frame_image, out_dir=out_dir)

    assert Path(cropped_path).exists()
    assert cropped_path.endswith("_ticker.png")

    with Image.open(cropped_path) as cropped_img:
        w, h = cropped_img.size
        # Expected width: 1280 * (0.98 - 0.02) = 1228.8 -> 1229
        # Expected height: 720 * (0.96 - 0.70) = 187.2 -> 187
        assert 1220 <= w <= 1235
        assert 180 <= h <= 195


def test_encode_image_to_base64(sample_frame_image):
    """Verifies base64 encoding returns non-empty string."""
    encoded = encode_image_to_base64(sample_frame_image)
    assert isinstance(encoded, str)
    assert len(encoded) > 100


def test_classify_frame_mock_success(sample_frame_image):
    """Tests LiteLLM VLM classification with structured JSON response."""
    mock_response = AsyncMock()
    mock_choice = AsyncMock()
    mock_choice.message.content = '{"scene_type": "breaking_news", "confidence": 0.95, "description": "Anchor at news desk with red banner"}'
    mock_response.choices = [mock_choice]

    with patch("litellm.acompletion", return_value=mock_response):
        result = asyncio.run(classify_frame(sample_frame_image, model="llava:7b"))

        assert result["scene_type"] == "breaking_news"
        assert result["confidence"] == 0.95
        assert "news desk" in result["description"]


def test_classify_frame_graceful_fallback(sample_frame_image):
    """Tests graceful degradation when Ollama/LiteLLM is unreachable or raises an error."""
    with patch("litellm.acompletion", side_effect=ConnectionError("Ollama daemon unreachable on port 11434")):
        result = asyncio.run(classify_frame(sample_frame_image, model="llava:7b"))

        assert result["scene_type"] == "unknown"
        assert result["confidence"] == 0.0
        assert "unavailable" in result["description"]


def test_vision_pipeline_process_frame(sample_frame_image):
    """Tests complete concurrent execution of ticker crop, OCR, and VLM within VisionPipeline."""
    pipeline = VisionPipeline(stream_id="test_stream_01", channel_name="news_247")

    mock_ocr = {
        "text": "BREAKING NEWS: LIVE BROADCAST TEST",
        "boxes": [
            {"x0": 50, "y0": 550, "x1": 150, "y1": 570, "conf": 98.2, "word": "BREAKING"},
            {"x0": 160, "y0": 550, "x1": 220, "y1": 570, "conf": 97.5, "word": "NEWS:"},
        ],
    }
    mock_vlm = {
        "scene_type": "breaking_news",
        "confidence": 0.92,
        "description": "Studio breaking news broadcast",
    }

    with patch("services.vision.pipeline.run_ocr", return_value=mock_ocr), \
         patch("services.vision.pipeline.classify_frame", return_value=mock_vlm):

        frame_capture = FrameCapture(
            stream_id="test_stream_01",
            channel_name="news_247",
            frame_index=1,
            timestamp_seconds=1.0,
            file_path=str(sample_frame_image),
        )

        event = asyncio.run(pipeline.process_frame(frame_capture))

        assert isinstance(event, VisionEvent)
        assert event.stream_id == "test_stream_01"
        assert event.scene_type == "breaking_news"
        assert event.confidence == 0.92
        assert event.ticker_text == "BREAKING NEWS: LIVE BROADCAST TEST"
        assert event.ocr_box_count == 2
        assert pipeline.total_frames_processed == 1
        assert not pipeline.event_queue.empty()
