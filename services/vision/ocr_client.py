"""Asynchronous Python Client for the SignalIntel Rust OCR Binary.

Executes the high-performance Rust OCR CLI (`signalintel-ocr`) as an asynchronous
subprocess, parsing word bounding boxes and consolidated ticker text.
"""

import os
import json
import shutil
import logging
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, Union

logger = logging.getLogger("signalintel.vision.ocr")

DEFAULT_OCR_BIN = "signalintel-ocr"


def resolve_ocr_binary_path() -> str:
    """Resolves the executable path for the signalintel-ocr Rust binary.

    Checks:
    1. SIGNALINTEL_OCR_BIN environment variable.
    2. System PATH lookup via shutil.which().
    3. Monorepo workspace target build directories (debug / release).
    """
    env_bin = os.getenv("SIGNALINTEL_OCR_BIN")
    if env_bin:
        return env_bin

    which_bin = shutil.which(DEFAULT_OCR_BIN)
    if which_bin:
        return which_bin

    # Monorepo relative search
    base_dirs = [
        Path.cwd() / "crates" / "target" / "debug" / "signalintel-ocr.exe",
        Path.cwd() / "crates" / "target" / "release" / "signalintel-ocr.exe",
        Path.cwd() / "crates" / "target" / "debug" / "signalintel-ocr",
        Path.cwd() / "crates" / "target" / "release" / "signalintel-ocr",
    ]
    for candidate in base_dirs:
        if candidate.exists() and candidate.is_file():
            return str(candidate)

    return DEFAULT_OCR_BIN


async def run_ocr(
    image_path: Union[str, Path],
    lang: str = "eng",
    timeout: float = 8.0,
) -> Optional[Dict[str, Any]]:
    """Runs the Rust OCR binary on the target image and returns parsed JSON.

    Args:
        image_path: Path to the cropped ticker or full frame image.
        lang: Tesseract language code (e.g. 'eng', 'spa', 'fra').
        timeout: Subprocess execution timeout in seconds.

    Returns:
        Dict with keys 'text' (str) and 'boxes' (List[Dict]), or None if OCR fails.
    """
    img_path = Path(image_path).resolve()
    if not img_path.exists():
        logger.warning(f"OCR target image does not exist: {img_path}")
        return None

    ocr_bin = resolve_ocr_binary_path()
    cmd = [ocr_bin, "--image", str(img_path), "--lang", lang]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            logger.warning(f"OCR process timed out for image [{img_path.name}]")
            return None

        if proc.returncode != 0:
            err_output = stderr_bytes.decode("utf-8", errors="replace").strip()
            logger.debug(f"OCR binary exited with code {proc.returncode} for [{img_path.name}]: {err_output}")
            return None

        stdout_text = stdout_bytes.decode("utf-8", errors="replace").strip()
        if not stdout_text:
            return {"text": "", "boxes": []}

        parsed: Dict[str, Any] = json.loads(stdout_text)
        logger.debug(
            f"OCR completed for [{img_path.name}]: {len(parsed.get('boxes', []))} boxes, text='{parsed.get('text', '')[:40]}...'"
        )
        return parsed

    except FileNotFoundError:
        logger.warning(f"Rust OCR binary not found at '{ocr_bin}'. Ensure signalintel-ocr is built or on PATH.")
        return None
    except Exception as exc:
        logger.warning(f"Unexpected error running OCR on [{img_path.name}]: {exc}")
        return None
