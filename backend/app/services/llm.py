# app/services/llm.py

import asyncio
from openai import AsyncOpenAI, RateLimitError

from app.config import settings

# OpenRouter is OpenAI-compatible
# when moving to direct provider, just change base_url and api_key only

client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",
)

# model aliases from .env
SMART = settings.llm_smart
FAST = settings.llm_fast

async def _chat(model: str, prompt: str, max_tokens: int = 1000, retries: int = 3) -> str:
    """Single-turn call. Used for ingestion and grading"""
    for attempt in range(retries):
        try:
            response = await client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}]
            )
            content = response.choices[0].message.content
            if content:
                return content.strip()
            await asyncio.sleep(2 ** attempt)
        except RateLimitError:
            if attempt == retries - 1:
                raise
            wait = 5 * (2 ** attempt)
            await asyncio.sleep(wait)
    raise ValueError(f"Empty response from {model} after {retries} attempts")

async def _chat_with_system(
        model: str,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
) -> str:
    """Multi-turn call with system prompt; used for chat mode"""
    all_messages = [{"role": "system", "content": system}] + messages
    response = await client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=all_messages,
    )
    return response.choices[0].message.content.strip()

async def _chat_vision(
        model: str,
        prompt: str,
        image_b64: str,
        media_type: str = "image/jpeg",
        max_tokens: int = 2000,
) -> str:
    """vision call - sends image + text prompt to create a multimodal model"""
    response = await client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{image_b64}"
                    }
                },
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }]
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError(f"Empty vision response from {model}")
    return content.strip()

async def generate_context_prefix(
        document_summary: str,
        chunk_text: str,
        heading_path: list[str],
) -> str:
    """Contextual Retrieval prefix; runs once per chunk at ingest; uses FAST"""
    heading = " > ".join(heading_path) if heading_path else "Introduction"
    prompt = (
        "Heree is a document (first 8000 chars):\n"
        f"<document>\n{document_summary}\n</document>\n\n"
        "Here is a chunk from this document:\n"
        f"<chunk>\nHeading path: {heading}\n{chunk_text}\n</chunk>\n\n"
        "Write 2-3 sentences situating this chunk in the document.\n"
        "Cover: what topic this is part of, what came before if relevant,\n"
        "and what about the document is fundamentally about.\n"
        "Be specific. Do not start with This chunk.\n"
        "Respond with only the context sentences, nothing else."
    )
    return await _chat(FAST, prompt, max_tokens=200)

async def extract_concepts(document_text: str) -> list[str]:
    """Extract 5-20 key concepts for mastery tracking; uses FAST model"""
    prompt = (
        "Read this document and identify the 5 to 20 most important\n"
        "concepts, topics, or skills a learner neeeds to understand.\n\n"
        "Rules:\n"
        "- Each concept should be 2-5 words\n"
        "- Be specific (not biology but cell membrane transport)\n"
        "- Order by importance"
        "- Respond with a JSON array of strings ONLY. No explanation. No markdown\n\n"
        f"<document>\n{document_text[:6000]}</document>"
    )
    import json
    raw = await _chat(FAST, prompt, max_tokens=500)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    if not raw:
        return []
    
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # try extracting a JSON array if model added surrounding text
        import re
        match = re.search(r'\[.*?\]', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return []