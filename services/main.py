"""SignalIntel Master FastAPI Media Pipeline Orchestrator.

Exposes REST and WebSocket APIs for:
1. Live stream ingestion management (FFmpeg subprocess demux)
2. Real-time audio transcription and translation (Whisper + Deep-Translator)
3. Live WebSocket broadcast of SRT subtitle blocks
4. High-frequency health telemetry and stream lifecycle monitoring
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.ingestion.models import StreamConfig, StreamStatus, FrameCapture, AudioChunk
from services.ingestion.stream_capture import StreamCapture
from services.audio.models import TranscriptSegment, TranscriptEvent
from services.audio.pipeline import AudioIntelligencePipeline

PROTOCOL_VERSION = "v1.2-realtime"
MAX_EVENT_BUFFER = 500

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("signalintel.orchestrator")


# ─── WEBSOCKET BROADCAST MANAGER ───────────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket client connections for real-time transcript streaming."""

    def __init__(self):
        self._global_connections: List[WebSocket] = []
        self._stream_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, stream_id: Optional[str] = None):
        await websocket.accept()
        if stream_id:
            if stream_id not in self._stream_connections:
                self._stream_connections[stream_id] = []
            self._stream_connections[stream_id].append(websocket)
            logger.info(f"WebSocket client connected to stream [{stream_id}]")
        else:
            self._global_connections.append(websocket)
            logger.info("WebSocket client connected to global transcript stream")

    def disconnect(self, websocket: WebSocket, stream_id: Optional[str] = None):
        if stream_id and stream_id in self._stream_connections:
            if websocket in self._stream_connections[stream_id]:
                self._stream_connections[stream_id].remove(websocket)
            if not self._stream_connections[stream_id]:
                del self._stream_connections[stream_id]
        elif websocket in self._global_connections:
            self._global_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected (stream_id={stream_id})")

    async def broadcast_transcript(self, event: TranscriptEvent):
        """Broadcasts transcript event to global and stream-specific subscribers."""
        payload = event.model_dump_json()

        # Send to global subscribers
        for ws in list(self._global_connections):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(ws)

        # Send to stream-specific subscribers
        if event.stream_id in self._stream_connections:
            for ws in list(self._stream_connections[event.stream_id]):
                try:
                    await ws.send_text(payload)
                except Exception:
                    self.disconnect(ws, event.stream_id)


ws_manager = ConnectionManager()


# ─── STREAM PIPELINE MANAGER ────────────────────────────────────────────────

class StreamManager:
    """Orchestrates active stream capture sessions and audio intelligence pipelines."""

    def __init__(self):
        self.active_streams: Dict[str, StreamCapture] = {}
        self.audio_pipelines: Dict[str, AudioIntelligencePipeline] = {}
        self.stream_configs: Dict[str, StreamConfig] = {}
        self.recent_events: List[TranscriptEvent] = []
        self.total_frames_captured: int = 0
        self.total_transcripts_produced: int = 0
        self.start_time: datetime = datetime.utcnow()

    async def start_stream(self, config: StreamConfig) -> StreamStatus:
        """Initializes and starts a new stream capture & intelligence worker."""
        if config.stream_id in self.active_streams:
            existing = self.active_streams[config.stream_id]
            if existing.status.status == "active":
                return existing.status

        # Create audio intelligence pipeline instance for this stream
        pipeline = AudioIntelligencePipeline(
            model_size="base",
            default_target_lang=config.target_lang,
        )
        self.audio_pipelines[config.stream_id] = pipeline
        self.stream_configs[config.stream_id] = config

        # Define callbacks for frames and audio chunks
        async def handle_frame(frame: FrameCapture):
            self.total_frames_captured += 1
            logger.debug(f"Frame #{frame.frame_index} captured for stream [{frame.stream_id}]")

        async def handle_audio_chunk(chunk: AudioChunk):
            logger.info(f"Processing audio chunk #{chunk.chunk_index} for stream [{chunk.stream_id}]")
            try:
                # Process audio chunk through Whisper + Google Translate + SRT Formatter
                segments = pipeline.process_audio_chunk(
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
                    if len(self.recent_events) > 500:
                        self.recent_events.pop(0)

                    # Broadcast via WebSocket
                    await ws_manager.broadcast_transcript(event)
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
    title="SignalIntel Media Processing & Audio Intelligence API",
    description="Asynchronous multi-stream video demux, Whisper STT, and Google Translate SRT pipeline.",
    version="0.2.0",
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
        "version": "0.2.0",
        "uptime_seconds": round(uptime_seconds, 1),
        "active_streams_count": len(stream_manager.active_streams),
        "total_frames_captured": stream_manager.total_frames_captured,
        "total_transcripts_produced": stream_manager.total_transcripts_produced,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/streams/start", response_model=StreamStatus, tags=["Streams"])
async def start_stream(config: StreamConfig):
    """Spawns an asynchronous FFmpeg demuxer and audio intelligence pipeline for a stream."""
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


# ─── WEBSOCKET ENDPOINTS ───────────────────────────────────────────────────

@app.websocket("/api/v1/ws/transcripts")
async def ws_transcripts_global(websocket: WebSocket):
    """Global WebSocket feed streaming live SRT subtitle blocks across all active streams."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; client can send pings
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


@app.websocket("/api/v1/ws/transcripts/{stream_id}")
async def ws_transcripts_stream(websocket: WebSocket, stream_id: str):
    """Stream-specific WebSocket feed for live subtitle blocks."""
    await ws_manager.connect(websocket, stream_id=stream_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, stream_id=stream_id)
    except Exception:
        ws_manager.disconnect(websocket, stream_id=stream_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("services.main:app", host="0.0.0.0", port=8000, reload=True)
