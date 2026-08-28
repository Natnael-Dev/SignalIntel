"""Lower-Third Region-of-Interest (RoI) Ticker Cropper.

Extracts the broadcast lower-third / chyron region from video frames
for downstream high-resolution optical character recognition (OCR).
"""

import logging
from pathlib import Path
from typing import Optional, Union
from PIL import Image

logger = logging.getLogger("signalintel.vision.ticker_crop")


def crop_lower_third(
    frame_path: Union[str, Path],
    out_dir: Optional[Union[str, Path]] = None,
) -> str:
    """Crops the lower-third region of a broadcast frame.

    Bounding Box:
        - X: 2% to 98% of frame width
        - Y: 70% to 96% of frame height

    Args:
        frame_path: Path to source frame image.
        out_dir: Optional destination directory for cropped image.
                 Defaults to the parent directory of the frame.

    Returns:
        Absolute string path to the saved cropped ticker image (<stem>_ticker.png).
    """
    src_path = Path(frame_path).resolve()
    if not src_path.exists():
        raise FileNotFoundError(f"Frame image not found for ticker crop: {src_path}")

    target_dir = Path(out_dir).resolve() if out_dir else src_path.parent
    target_dir.mkdir(parents=True, exist_ok=True)

    out_file = target_dir / f"{src_path.stem}_ticker.png"

    with Image.open(src_path) as img:
        width, height = img.size

        # Coordinate math for lower-third ticker region
        x0 = int(width * 0.02)
        y0 = int(height * 0.70)
        x1 = int(width * 0.98)
        y1 = int(height * 0.96)

        # Ensure valid non-inverted crop boundaries
        x0 = max(0, min(x0, width - 1))
        x1 = max(x0 + 1, min(x1, width))
        y0 = max(0, min(y0, height - 1))
        y1 = max(y0 + 1, min(y1, height))

        cropped = img.crop((x0, y0, x1, y1))
        cropped.save(out_file, format="PNG")

    logger.debug(f"Cropped ticker RoI [{width}x{height} -> ({x0},{y0},{x1},{y1})] -> {out_file}")
    return str(out_file)
