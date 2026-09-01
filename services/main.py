"""SignalIntel Master FastAPI Media Pipeline Orchestrator.

Exposes REST and WebSocket APIs for:
1. Live stream ingestion management (FFmpeg subprocess demux)
2. Real-time audio transcription and translation (Whisper + Deep-Translator)
3. Vision intelligence & scene classification + ticker OCR (LiteLLM + Rust OCR)
4. Live WebSocket broadcast of SRT subtitle blocks and Vision events
5. High-frequency health telemetry and stream lifecycle monitoring
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import os
import httpx
from services.ingestion.models import StreamConfig, StreamStatus, FrameCapture, AudioChunk
from services.ingestion.stream_capture import StreamCapture
from services.audio.models import TranscriptSegment, TranscriptEvent
from services.audio.pipeline import AudioIntelligencePipeline
from services.vision.models import VisionEvent, OcrResult, SceneClassification
from services.vision.pipeline import VisionPipeline

PROTOCOL_VERSION = "v1.4-brain-ipc"
MAX_EVENT_BUFFER = 500
RUST_BRAIN_INGEST_URL = os.getenv("SIGNALINTEL_BRAIN_URL", "http://127.0.0.1:8080/api/v1/ingest")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("signalintel.orchestrator")


async def forward_to_rust_brain(payload: dict):
    """Asynchronously forwards TranscriptEvent or VisionEvent to the Rust Brain gateway."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(RUST_BRAIN_INGEST_URL, json=payload)
    except Exception as exc:
        # Non-blocking fire-and-forget: do not interrupt stream processing if gateway is starting up
        logger.debug(f"Brain IPC notice: {exc}")



# ─── WEBSOCKET BROADCAST MANAGER ───────────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket client connections for real-time transcript & vision feeds."""

    def __init__(self):
        # Audio / Transcript connections
        self._global_transcript_connections: List[WebSocket] = []
        self._stream_transcript_connections: Dict[str, List[WebSocket]] = {}

        # Vision / OCR connections
        self._global_vision_connections: List[WebSocket] = []
        self._stream_vision_connections: Dict[str, List[WebSocket]] = {}

    # ── Transcript Connections ──
    async def connect_transcript(self, websocket: WebSocket, stream_id: Optional[str] = None):
        await websocket.accept()
        if stream_id:
            if stream_id not in self._stream_transcript_connections:
                self._stream_transcript_connections[stream_id] = []
            self._stream_transcript_connections[stream_id].append(websocket)
            logger.info(f"WebSocket client connected to transcript stream [{stream_id}]")
        else:
            self._global_transcript_connections.append(websocket)
            logger.info("WebSocket client connected to global transcript stream")

    def disconnect_transcript(self, websocket: WebSocket, stream_id: Optional[str] = None):
        if stream_id and stream_id in self._stream_transcript_connections:
            if websocket in self._stream_transcript_connections[stream_id]:
                self._stream_transcript_connections[stream_id].remove(websocket)
            if not self._stream_transcript_connections[stream_id]:
                del self._stream_transcript_connections[stream_id]
        elif websocket in self._global_transcript_connections:
            self._global_transcript_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected from transcripts (stream_id={stream_id})")

    async def broadcast_transcript(self, event: TranscriptEvent):
        """Broadcasts transcript event to global and stream-specific subscribers."""
        payload = event.model_dump_json()

        for ws in list(self._global_transcript_connections):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect_transcript(ws)

        if event.stream_id in self._stream_transcript_connections:
            for ws in list(self._stream_transcript_connections[event.stream_id]):
                try:
                    await ws.send_text(payload)
                except Exception:
                    self.disconnect_transcript(ws, event.stream_id)

    # ── Vision Connections ──
    async def connect_vision(self, websocket: WebSocket, stream_id: Optional[str] = None):
        await websocket.accept()
        if stream_id:
            if stream_id not in self._stream_vision_connections:
                self._stream_vision_connections[stream_id] = []
            self._stream_vision_connections[stream_id].append(websocket)
            logger.info(f"WebSocket client connected to vision stream [{stream_id}]")
        else:
            self._global_vision_connections.append(websocket)
            logger.info("WebSocket client connected to global vision stream")

    def disconnect_vision(self, websocket: WebSocket, stream_id: Optional[str] = None):
        if stream_id and stream_id in self._stream_vision_connections:
            if websocket in self._stream_vision_connections[stream_id]:
                self._stream_vision_connections[stream_id].remove(websocket)
            if not self._stream_vision_connections[stream_id]:
                del self._stream_vision_connections[stream_id]
        elif websocket in self._global_vision_connections:
            self._global_vision_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected from vision (stream_id={stream_id})")

    async def broadcast_vision(self, event: VisionEvent):
        """Broadcasts vision event to global and stream-specific subscribers."""
        payload = event.model_dump_json()

        for ws in list(self._global_vision_connections):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect_vision(ws)

        if event.stream_id in self._stream_vision_connections:
            for ws in list(self._stream_vision_connections[event.stream_id]):
                try:
                    await ws.send_text(payload)
                except Exception:
                    self.disconnect_vision(ws, event.stream_id)


ws_manager = ConnectionManager()


# ─── STREAM PIPELINE MANAGER ────────────────────────────────────────────────

class StreamManager:
    """Orchestrates active stream capture sessions, audio and vision intelligence pipelines."""

    def __init__(self):
        self.active_streams: Dict[str, StreamCapture] = {}
        self.audio_pipelines: Dict[str, AudioIntelligencePipeline] = {}
        self.vision_pipelines: Dict[str, VisionPipeline] = {}
        self.stream_configs: Dict[str, StreamConfig] = {}
        self.recent_events: List[TranscriptEvent] = []
        self.recent_vision_events: List[VisionEvent] = []
        self.total_frames_captured: int = 0
        self.total_transcripts_produced: int = 0
        self.total_vision_events_produced: int = 0
        self.start_time: datetime = datetime.utcnow()

    async def start_stream(self, config: StreamConfig) -> StreamStatus:
        """Initializes and starts a new stream capture & intelligence worker."""
        if config.stream_id in self.active_streams:
            existing = self.active_streams[config.stream_id]
            if existing.status.status == "active":
                return existing.status

        # Create audio and vision intelligence pipeline instances
        audio_pipeline = AudioIntelligencePipeline(
            model_size="base",
            default_target_lang=config.target_lang,
        )
        vision_pipeline = VisionPipeline(
            stream_id=config.stream_id,
            channel_name=config.channel_name,
        )

        self.audio_pipelines[config.stream_id] = audio_pipeline
        self.vision_pipelines[config.stream_id] = vision_pipeline
        self.stream_configs[config.stream_id] = config

        # Define callbacks for frames and audio chunks
        async def handle_frame(frame: FrameCapture):
            self.total_frames_captured += 1
            logger.debug(f"Frame #{frame.frame_index} captured for stream [{frame.stream_id}]")
            try:
                # Concurrently crop lower-third ticker, run OCR, and classify scene via VLM
                vision_event = await vision_pipeline.process_frame(frame)
                self.total_vision_events_produced += 1
                self.recent_vision_events.append(vision_event)
                if len(self.recent_vision_events) > MAX_EVENT_BUFFER:
                    self.recent_vision_events.pop(0)

                # Broadcast via WebSocket
                await ws_manager.broadcast_vision(vision_event)

                # Forward to Rust Brain via IPC Ingest API
                asyncio.create_task(forward_to_rust_brain(vision_event.model_dump(mode="json")))
            except Exception as err:
                logger.error(f"Error processing frame #{frame.frame_index} in vision pipeline: {err}", exc_info=True)

        async def handle_audio_chunk(chunk: AudioChunk):
            logger.info(f"Processing audio chunk #{chunk.chunk_index} for stream [{chunk.stream_id}]")
            try:
                # Process audio chunk through Whisper + Google Translate + SRT Formatter
                segments = audio_pipeline.process_audio_chunk(
                    audio_source=chunk.file_path,
                    start_offset_seconds=chunk.start_time_seconds,
                    target_lang=config.target_lang,
                    source_lang=config.source_lang,
                )

                for seg in segments:
                    self.total_transcripts_produced += 1
                    event = TranscriptEvent(
                        stream_id=chunk.stream_id,
                        channel_name=chunk.channel_name,
                        chunk_index=chunk.chunk_index,
                        segment=seg,
                    )
                    self.recent_events.append(event)
                    if len(self.recent_events) > MAX_EVENT_BUFFER:
                        self.recent_events.pop(0)

                    # Broadcast via WebSocket
                    await ws_manager.broadcast_transcript(event)

                    # Forward to Rust Brain via IPC Ingest API
                    asyncio.create_task(forward_to_rust_brain(event.model_dump(mode="json")))
            except Exception as err:
                logger.error(f"Error handling audio chunk #{chunk.chunk_index}: {err}", exc_info=True)

        capture = StreamCapture(
            config=config,
            on_frame=handle_frame,
            on_audio_chunk=handle_audio_chunk,
        )
        self.active_streams[config.stream_id] = capture

        await capture.start()
        return capture.status

    async def stop_stream(self, stream_id: str) -> bool:
        """Stops an active stream worker."""
        if stream_id in self.active_streams:
            capture = self.active_streams[stream_id]
            await capture.stop()
            del self.active_streams[stream_id]
            if stream_id in self.audio_pipelines:
                del self.audio_pipelines[stream_id]
            if stream_id in self.vision_pipelines:
                self.vision_pipelines[stream_id].stop()
                del self.vision_pipelines[stream_id]
            return True
        return False

    async def shutdown_all(self):
        """Stops all running stream workers on server shutdown."""
        logger.info("Shutting down all active streams...")
        for stream_id in list(self.active_streams.keys()):
            await self.stop_stream(stream_id)


stream_manager = StreamManager()


# ─── FASTAPI APPLICATION LIFESPAN & ROUTES ─────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SignalIntel Media Orchestrator initialized.")
    yield
    await stream_manager.shutdown_all()
    logger.info("SignalIntel Media Orchestrator stopped.")


app = FastAPI(
    title="SignalIntel Media Processing, Audio & Vision Intelligence API",
    description="Asynchronous multi-stream video demux, Whisper STT, Google Translate SRT, Scene VLM & Ticker OCR pipeline.",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health", tags=["System"])
async def get_health():
    """Returns orchestrator runtime health and telemetry statistics."""
    uptime_seconds = (datetime.utcnow() - stream_manager.start_time).total_seconds()
    return {
        "status": "healthy",
        "service": "signalintel-media-orchestrator",
        "version": "0.3.0",
        "protocol": PROTOCOL_VERSION,
        "uptime_seconds": round(uptime_seconds, 1),
        "active_streams_count": len(stream_manager.active_streams),
        "total_frames_captured": stream_manager.total_frames_captured,
        "total_transcripts_produced": stream_manager.total_transcripts_produced,
        "total_vision_events_produced": stream_manager.total_vision_events_produced,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/streams/start", response_model=StreamStatus, tags=["Streams"])
async def start_stream(config: StreamConfig):
    """Spawns an asynchronous FFmpeg demuxer, audio intelligence, and vision pipeline for a stream."""
    try:
        status = await stream_manager.start_stream(config)
        return status
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start stream capture: {str(exc)}",
        )


@app.post("/api/v1/streams/{stream_id}/stop", tags=["Streams"])
async def stop_stream(stream_id: str):
    """Stops an active stream capture session."""
    stopped = await stream_manager.stop_stream(stream_id)
    if not stopped:
        raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found.")
    return {"status": "stopped", "stream_id": stream_id}


@app.get("/api/v1/streams", response_model=List[StreamStatus], tags=["Streams"])
async def list_streams():
    """Lists all active stream capture workers and their statistics."""
    return [capture.status for capture in stream_manager.active_streams.values()]


@app.get("/api/v1/streams/{stream_id}", response_model=StreamStatus, tags=["Streams"])
async def get_stream(stream_id: str):
    """Retrieves status details for a specific stream."""
    if stream_id not in stream_manager.active_streams:
        raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found.")
    return stream_manager.active_streams[stream_id].status


@app.get("/api/v1/transcripts/recent", response_model=List[TranscriptEvent], tags=["Transcripts"])
async def get_recent_transcripts(limit: int = 50):
    """Retrieves the most recent subtitle / transcript events."""
    return stream_manager.recent_events[-limit:]


@app.get("/api/v1/vision/recent", response_model=List[VisionEvent], tags=["Vision"])
async def get_recent_vision_events(limit: int = 50):
    """Retrieves the most recent vision classification and ticker OCR events."""
    return stream_manager.recent_vision_events[-limit:]


# ─── WEBSOCKET ENDPOINTS ───────────────────────────────────────────────────

@app.websocket("/api/v1/ws/transcripts")
async def ws_transcripts_global(websocket: WebSocket):
    """Global WebSocket feed streaming live SRT subtitle blocks across all active streams."""
    await ws_manager.connect_transcript(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_transcript(websocket)
    except Exception:
        ws_manager.disconnect_transcript(websocket)


@app.websocket("/api/v1/ws/transcripts/{stream_id}")
async def ws_transcripts_stream(websocket: WebSocket, stream_id: str):
    """Stream-specific WebSocket feed for live subtitle blocks."""
    await ws_manager.connect_transcript(websocket, stream_id=stream_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_transcript(websocket, stream_id=stream_id)
    except Exception:
        ws_manager.disconnect_transcript(websocket, stream_id=stream_id)


@app.websocket("/api/v1/ws/vision")
async def ws_vision_global(websocket: WebSocket):
    """Global WebSocket feed streaming live scene classification & ticker OCR events."""
    await ws_manager.connect_vision(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_vision(websocket)
    except Exception:
        ws_manager.disconnect_vision(websocket)


@app.websocket("/api/v1/ws/vision/{stream_id}")
async def ws_vision_stream(websocket: WebSocket, stream_id: str):
    """Stream-specific WebSocket feed for live scene classification & ticker OCR."""
    await ws_manager.connect_vision(websocket, stream_id=stream_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_vision(websocket, stream_id=stream_id)
    except Exception:
        ws_manager.disconnect_vision(websocket, stream_id=stream_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("services.main:app", host="0.0.0.0", port=8000, reload=True)
