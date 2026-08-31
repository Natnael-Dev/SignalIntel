"""Vision Intelligence Pipeline: Concurrent Scene Classification + Ticker OCR.

Coordinates the visual analysis of incoming video stream frames:
1. Concurrently crops lower-third ticker RoI and executes Rust OCR.
2. Base64-encodes full frame and queries Vision LLM (SatelliteEye Ollama port).
3. Consolidates results into typed VisionEvent payloads and pushes to an asyncio.Queue.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any, Union, Callable

from services.ingestion.models import FrameCapture
from services.vision.models import VisionEvent, OcrResult, SceneClassification
from services.vision.ticker_crop import crop_lower_third
from services.vision.ocr_client import run_ocr
from services.vision.vision_llm import classify_frame

logger = logging.getLogger("signalintel.vision.pipeline")


class VisionPipeline:
    """Orchestrates end-to-end visual frame intelligence for a broadcast stream."""

    def __init__(
        self,
        stream_id: str = "default",
        channel_name: str = "live_stream",
        vision_model: Optional[str] = None,
        ocr_lang: str = "eng",
        max_queue_size: int = 500,
    ):
        self.stream_id = stream_id
        self.channel_name = channel_name
        self.vision_model = vision_model
        self.ocr_lang = ocr_lang
        self.event_queue: asyncio.Queue[VisionEvent] = asyncio.Queue(maxsize=max_queue_size)
        self.total_frames_processed: int = 0
        self._running: bool = False

    async def _process_ticker_ocr(self, frame_path: str) -> Optional[Dict[str, Any]]:
        """Worker task: Crops lower-third chyron and runs Rust OCR."""
        try:
            # Step 1: Crop lower-third ticker region
            ticker_crop_path = crop_lower_third(frame_path)
            # Step 2: Run Rust OCR CLI on ticker crop
            ocr_data = await run_ocr(ticker_crop_path, lang=self.ocr_lang)
            return ocr_data
        except Exception as exc:
            logger.warning(f"Ticker OCR failed for [{Path(frame_path).name}]: {exc}")
            return None

    async def _process_scene_vlm(self, frame_path: str) -> Dict[str, Any]:
        """Worker task: Encodes full frame and queries Vision LLM."""
        try:
            return await classify_frame(frame_path, model=self.vision_model)
        except Exception as exc:
            logger.warning(f"Scene VLM failed for [{Path(frame_path).name}]: {exc}")
            return {
                "scene_type": "unknown",
                "confidence": 0.0,
                "description": f"VLM error: {str(exc)}",
            }

    async def process_frame(
        self,
        frame: Union[FrameCapture, Dict[str, Any]],
    ) -> VisionEvent:
        """Processes a single video frame concurrently through OCR and Vision LLM.

        Args:
            frame: FrameCapture model or dict containing 'file_path', 'timestamp_seconds', etc.

        Returns:
            Consolidated VisionEvent with scene type, confidence, ticker text, and OCR stats.
        """
        if isinstance(frame, FrameCapture):
            frame_path = frame.file_path or ""
            timestamp = frame.timestamp_seconds
            stream_id = frame.stream_id
            channel_name = frame.channel_name
        else:
            frame_path = str(frame.get("file_path", ""))
            timestamp = float(frame.get("timestamp_seconds", 0.0))
            stream_id = str(frame.get("stream_id", self.stream_id))
            channel_name = str(frame.get("channel_name", self.channel_name))

        if not frame_path or not Path(frame_path).exists():
            raise FileNotFoundError(f"Frame file not found: {frame_path}")

        # Execute Ticker Cropping + OCR and Scene VLM concurrently
        ocr_task = self._process_ticker_ocr(frame_path)
        vlm_task = self._process_scene_vlm(frame_path)

        ocr_res, vlm_res = await asyncio.gather(ocr_task, vlm_task, return_exceptions=True)

        # Parse OCR results
        ticker_text: Optional[str] = None
        ocr_box_count: int = 0
        if isinstance(ocr_res, dict):
            raw_text = str(ocr_res.get("text", "")).strip()
            ticker_text = raw_text if raw_text else None
            ocr_box_count = len(ocr_res.get("boxes", []))

        # Parse VLM results
        scene_type = "unknown"
        confidence = 0.0
        description = None
        if isinstance(vlm_res, dict):
            scene_type = vlm_res.get("scene_type", "unknown")
            confidence = float(vlm_res.get("confidence", 0.0))
            description = vlm_res.get("description")

        event = VisionEvent(
            stream_id=stream_id,
            channel_name=channel_name,
            timestamp=timestamp,
            frame_path=str(Path(frame_path).resolve()),
            scene_type=scene_type,
            confidence=confidence,
            ticker_text=ticker_text,
            ocr_box_count=ocr_box_count,
            description=description,
        )

        self.total_frames_processed += 1

        # Enqueue event (drop oldest if full)
        if self.event_queue.full():
            try:
                self.event_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass

        await self.event_queue.put(event)
        logger.info(
            f"VisionEvent generated for [{Path(frame_path).name}]: scene='{scene_type}' ({confidence:.2f}), ticker='{ticker_text or 'None'}'"
        )
        return event

    async def watch_and_process(
        self,
        frames_dir: Union[str, Path],
        on_event: Optional[Callable[[VisionEvent], Any]] = None,
        poll_interval: float = 0.5,
    ):
        """Watches a frames directory and continuously processes newly arriving frames."""
        self._running = True
        directory = Path(frames_dir)
        seen_files = set()
        frame_idx = 0

        logger.info(f"Starting VisionPipeline directory watcher on {directory}")

        while self._running:
            try:
                files = sorted(directory.glob("frame_*.png"))
                for file_path in files:
                    if file_path not in seen_files and file_path != files[-1]:
                        seen_files.add(file_path)
                        frame_idx += 1

                        capture = FrameCapture(
                            stream_id=self.stream_id,
                            channel_name=self.channel_name,
                            frame_index=frame_idx,
                            timestamp_seconds=float(frame_idx),
                            file_path=str(file_path),
                        )

                        event = await self.process_frame(capture)
                        if on_event:
                            if asyncio.iscoroutinefunction(on_event):
                                await on_event(event)
                            else:
                                on_event(event)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Error in VisionPipeline watcher loop: {exc}")

            await asyncio.sleep(poll_interval)

    def stop(self):
        """Stops the directory watcher loop."""
        self._running = False
