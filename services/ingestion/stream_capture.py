"""Asynchronous FFmpeg Subprocess Wrapper for Stream Demuxing.

Splits a live video stream (RTSP, HLS, HTTP, File) into:
1. Video Frames (1 FPS, scaled to 720p PNG/JPEG)
2. Audio Segments (16kHz, mono, 16-bit PCM WAV)
"""

import asyncio
import os
import shutil
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional, List, Dict, Any

from services.ingestion.models import StreamConfig, FrameCapture, AudioChunk, StreamStatus

logger = logging.getLogger("signalintel.ingestion")
logging.basicConfig(level=logging.INFO)


class StreamCapture:
    """Manages asynchronous FFmpeg worker processes for live stream demuxing."""

    def __init__(
        self,
        config: StreamConfig,
        on_frame: Optional[Callable[[FrameCapture], Any]] = None,
        on_audio_chunk: Optional[Callable[[AudioChunk], Any]] = None,
    ):
        self.config = config
        self.on_frame = on_frame
        self.on_audio_chunk = on_audio_chunk

        self.status = StreamStatus(
            stream_id=config.stream_id,
            channel_name=config.channel_name,
            url=config.url,
            status="initializing",
        )

        # Temporary work directories
        base_dir = Path(config.output_dir or f"tmp/{config.stream_id}")
        self.frames_dir = base_dir / "frames"
        self.audio_dir = base_dir / "audio"
        self.frames_dir.mkdir(parents=True, exist_ok=True)
        self.audio_dir.mkdir(parents=True, exist_ok=True)

        self._video_process: Optional[asyncio.subprocess.Process] = None
        self._audio_process: Optional[asyncio.subprocess.Process] = None
        self._watcher_tasks: List[asyncio.Task] = []
        self._running = False
        self._frame_counter = 0
        self._chunk_counter = 0

    async def start(self):
        """Starts asynchronous video and audio demuxing workers."""
        if self._running:
            logger.warning(f"StreamCapture [{self.config.stream_id}] is already running.")
            return

        self._running = True
        self.status.status = "active"
        self.status.started_at = datetime.utcnow()
        logger.info(f"Starting StreamCapture for [{self.config.channel_name}] from {self.config.url}")

        try:
            await asyncio.gather(
                self._spawn_video_worker(),
                self._spawn_audio_worker(),
            )
            # Launch directory watchers for incoming frames and audio chunks
            self._watcher_tasks = [
                asyncio.create_task(self._watch_frames_directory()),
                asyncio.create_task(self._watch_audio_directory()),
            ]
        except Exception as exc:
            self.status.status = "error"
            self.status.error_message = str(exc)
            logger.error(f"Failed to start stream capture: {exc}", exc_info=True)
            await self.stop()
            raise

    async def _spawn_video_worker(self):
        """Spawns FFmpeg subprocess to extract frames at target FPS and resolution."""
        output_pattern = str(self.frames_dir / "frame_%06d.png")
        scale_filter = f"fps={self.config.fps},scale={self.config.resolution}"

        # Standard SatelliteEye FFmpeg arguments with low-latency flags
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-re",
            "-i", self.config.url,
            "-vf", scale_filter,
            "-vsync", "vfr",
            "-q:v", "2",
            "-y",
            output_pattern,
        ]

        logger.info(f"Spawning Video FFmpeg: {' '.join(cmd)}")
        try:
            self._video_process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            logger.error("FFmpeg binary not found on system PATH.")
            raise RuntimeError("FFmpeg executable not found. Ensure FFmpeg is installed.")

    async def _spawn_audio_worker(self):
        """Spawns FFmpeg subprocess to segment raw audio into 16kHz WAV chunks."""
        output_pattern = str(self.audio_dir / "chunk_%04d.wav")

        # Extract 16kHz mono audio segmented into fixed durations
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-re",
            "-i", self.config.url,
            "-vn",
            "-af", "highpass=f=80",
            "-acodec", "pcm_s16le",
            "-ar", str(self.config.audio_sample_rate),
            "-ac", "1",
            "-f", "segment",
            "-segment_time", str(self.config.audio_chunk_duration),
            "-reset_timestamps", "1",
            "-y",
            output_pattern,
        ]

        logger.info(f"Spawning Audio FFmpeg: {' '.join(cmd)}")
        try:
            self._audio_process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            logger.error("FFmpeg binary not found on system PATH.")
            raise RuntimeError("FFmpeg executable not found. Ensure FFmpeg is installed.")

    async def _watch_frames_directory(self):
        """Monitors frames directory and invokes on_frame callback when new frames arrive."""
        seen_frames = set()
        while self._running:
            try:
                files = sorted(self.frames_dir.glob("frame_*.png"))
                for file_path in files:
                    # Ignore the latest frame if it is still being written
                    if file_path not in seen_frames and file_path != files[-1]:
                        seen_frames.add(file_path)
                        self._frame_counter += 1
                        self.status.frames_captured = self._frame_counter
                        self.status.last_active_at = datetime.utcnow()

                        frame_event = FrameCapture(
                            stream_id=self.config.stream_id,
                            channel_name=self.config.channel_name,
                            frame_index=self._frame_counter,
                            timestamp_seconds=float(self._frame_counter) / self.config.fps,
                            file_path=str(file_path),
                        )
                        if self.on_frame:
                            if asyncio.iscoroutinefunction(self.on_frame):
                                await self.on_frame(frame_event)
                            else:
                                self.on_frame(frame_event)
            except Exception as e:
                logger.error(f"Error in frames watcher: {e}")
            await asyncio.sleep(0.5)

    async def _watch_audio_directory(self):
        """Monitors audio directory and invokes on_audio_chunk callback on completed chunks."""
        seen_chunks = set()
        while self._running:
            try:
                files = sorted(self.audio_dir.glob("chunk_*.wav"))
                for file_path in files:
                    # Process completed chunks (skip the very last active file currently recording)
                    if file_path not in seen_chunks and file_path != files[-1]:
                        seen_chunks.add(file_path)
                        self._chunk_counter += 1
                        self.status.audio_chunks_produced = self._chunk_counter
                        self.status.last_active_at = datetime.utcnow()

                        start_t = (self._chunk_counter - 1) * self.config.audio_chunk_duration
                        end_t = self._chunk_counter * self.config.audio_chunk_duration

                        chunk_event = AudioChunk(
                            stream_id=self.config.stream_id,
                            channel_name=self.config.channel_name,
                            chunk_index=self._chunk_counter,
                            start_time_seconds=float(start_t),
                            end_time_seconds=float(end_t),
                            sample_rate=self.config.audio_sample_rate,
                            file_path=str(file_path),
                        )
                        if self.on_audio_chunk:
                            if asyncio.iscoroutinefunction(self.on_audio_chunk):
                                await self.on_audio_chunk(chunk_event)
                            else:
                                self.on_audio_chunk(chunk_event)
            except Exception as e:
                logger.error(f"Error in audio watcher: {e}")
            await asyncio.sleep(0.8)

    async def stop(self):
        """Gracefully terminates FFmpeg workers and cleans up tasks."""
        self._running = False
        self.status.status = "stopped"
        logger.info(f"Stopping StreamCapture for [{self.config.stream_id}]")

        # Cancel directory watchers
        for task in self._watcher_tasks:
            task.cancel()

        # Terminate FFmpeg subprocesses
        for proc, name in [(self._video_process, "video"), (self._audio_process, "audio")]:
            if proc and proc.returncode is None:
                try:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=3.0)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                    logger.info(f"FFmpeg {name} process terminated gracefully.")
                except Exception as e:
                    logger.warning(f"Failed to cleanly terminate {name} process: {e}")

        self._video_process = None
        self._audio_process = None

    def cleanup_artifacts(self):
        """Removes temporary extracted frames and audio directories."""
        base_dir = Path(self.config.output_dir or f"tmp/{self.config.stream_id}")
        if base_dir.exists():
            try:
                shutil.rmtree(base_dir)
                logger.info(f"Cleaned up temporary artifacts in {base_dir}")
            except Exception as e:
                logger.warning(f"Error cleaning up {base_dir}: {e}")
