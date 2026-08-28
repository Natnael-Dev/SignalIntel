"""Scene Classifier & Visual Intelligence Module (SatelliteEye Port).

Classifies live broadcast video frames using a local or remote Vision LLM via LiteLLM.
Performs base64 image encoding, structured JSON schema prompt enforcement,
and resilient error handling with graceful fallback degradation.
"""

import os
import json
import base64
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Union

import litellm

logger = logging.getLogger("signalintel.vision.vlm")

DEFAULT_VISION_MODEL = "llava:7b"
VALID_SCENE_TYPES = {"program", "commercial", "breaking_news", "other"}

SYSTEM_PROMPT = """You are a broadcast intelligence vision system. Analyze the given video frame and classify the scene type.
You must return ONLY a strict JSON object with no additional markdown, formatting, or commentary.

JSON Schema:
{
  "scene_type": "program" | "commercial" | "breaking_news" | "other",
  "confidence": <float between 0.0 and 1.0>,
  "description": "<concise one-sentence visual summary of the frame>"
}"""


def encode_image_to_base64(image_path: Union[str, Path]) -> str:
    """Reads an image file and encodes its binary contents to base64."""
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image frame not found at: {path}")
    
    with open(path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode("utf-8")


async def classify_frame(
    frame_path: Union[str, Path],
    model: Optional[str] = None,
    timeout: float = 12.0,
) -> Dict[str, Any]:
    """Classifies a video frame scene type by querying a Vision LLM via LiteLLM.

    Args:
        frame_path: Path to the image frame (PNG / JPEG).
        model: Optional model name override. Defaults to SIGNALINTEL_VISION_MODEL env var or 'llava:7b'.
        timeout: Request timeout in seconds.

    Returns:
        Dict with keys 'scene_type', 'confidence', and 'description'.
        Gracefully returns scene_type='unknown' and confidence=0.0 on network/parsing failure.
    """
    model_name = model or os.getenv("SIGNALINTEL_VISION_MODEL", DEFAULT_VISION_MODEL)
    litellm_model = f"ollama/{model_name}" if not model_name.startswith("ollama/") else model_name

    try:
        # 1. Read and base64-encode the image frame
        base64_data = encode_image_to_base64(frame_path)
        data_url = f"data:image/png;base64,{base64_data}"

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Classify this broadcast frame according to the required JSON schema."},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ]

        # 2. Query LiteLLM asynchronously
        response = await litellm.acompletion(
            model=litellm_model,
            messages=messages,
            response_format={"type": "json_object"},
            timeout=timeout,
        )

        content = response.choices[0].message.content or "{}"
        
        # Strip potential markdown code fences if model emits ```json ... ```
        cleaned_content = content.strip()
        if cleaned_content.startswith("```"):
            cleaned_content = cleaned_content.strip("`")
            if cleaned_content.startswith("json"):
                cleaned_content = cleaned_content[4:].strip()

        parsed = json.loads(cleaned_content)
        scene_type = str(parsed.get("scene_type", "other")).lower().strip()
        if scene_type not in VALID_SCENE_TYPES:
            scene_type = "other"

        confidence = float(parsed.get("confidence", 0.8))
        confidence = max(0.0, min(1.0, confidence))
        description = str(parsed.get("description", "")).strip()

        logger.info(f"Classified frame [{Path(frame_path).name}]: scene_type='{scene_type}', conf={confidence:.2f}")
        return {
            "scene_type": scene_type,
            "confidence": confidence,
            "description": description,
        }

    except Exception as exc:
        # Graceful degradation: log warning and return safe default without crashing pipeline
        logger.warning(
            f"Vision classification fallback for [{Path(frame_path).name}] (model={litellm_model}): {exc}"
        )
        return {
            "scene_type": "unknown",
            "confidence": 0.0,
            "description": f"Classification unavailable: {str(exc)}",
        }
