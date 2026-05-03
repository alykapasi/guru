# app/services/vision.py

import base64
import pathlib

from app.services.llm import _chat_vision, SMART

async def transcribe_image(image_path: pathlib.Path) -> str:
    """
    use vision llm to transcribe text from an image,
    works for photos of handwritten notes, slides, whiteboards, printed text
    """
    image_bytes = image_path.read_bytes()
    b64 = base64.b64encode(image_bytes).decode()

    suffix = image_path.suffix.lower()
    media_type_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
    }
    media_type = media_type_map.get(suffix, "image/jpeg")

    prompt = (
        "Transcribe all text visible in this image as accurately as possible.\n"
        "If this appears to be handwritten notes:\n"
        "- Preserve the structure and hierarchy\n"
        "- Mark unclear words with [unclear]\n"
        "- Add a brief '## Summary' section at the end listing the key concepts\n\n"
        "If this is a printed document or slide, transcribe it verbatim.\n"
        "Output only the transcribed text, no commentary."
    )

    return await _chat_vision(SMART, prompt, b64, media_type)