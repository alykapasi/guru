# app/services/embedding.py

# import voyageai

# from app.config import settings

# vo = voyageai.AsyncClient(api_key=settings.voyage_api_key)

# EMBED_MODEL = "voyage-3"
# EMBED_DIMS = 1024
# BATCH_SIZE = 128

# async def embed_texts(texts: list[str]) -> list[list[float]]:
#     """Embed a list of texts in batches; returns a list of 1024 dim vectors"""
#     all_embeddings = []
#     for i in range(0, len(texts), BATCH_SIZE):
#         batch = texts[i:i+BATCH_SIZE]
#         result = await vo.embed(batch, model=EMBED_MODEL, input_type="document")
#         all_embeddings.extend(result.embeddings)
#     return all_embeddings

# async def embed_query(text: str) -> list[float]:
#     """Embed a single query string, NOTE: use input_type='query' for queries"""
#     result = await vo.embed([text], model=EMBED_MODEL, input_type='query')
#     return result.embeddings[0]

from openai import AsyncOpenAI, BadRequestError
import numpy as np

_client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",
)

EMBED_MODEL = "nomic-embed-text"
EMBED_DIMS = 768
BATCH_SIZE = 32
MAX_CHARS = 2000

async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    results = []
    for text in texts:
        if not text or not text.strip():
            text = "empty"

        # Split if too long, average the parts
        if len(text) <= MAX_CHARS:
            parts = [text]
        else:
            parts = [text[i:i+MAX_CHARS] for i in range(0, len(text), MAX_CHARS - 500)]

        part_embeddings = []
        for part in parts:
            response = await _client.embeddings.create(
                model=EMBED_MODEL,
                input=part,   # single string, not list
            )
            part_embeddings.append(response.data[0].embedding)

        if len(part_embeddings) == 1:
            results.append(part_embeddings[0])
        else:
            avg = np.mean(np.array(part_embeddings), axis=0)
            results.append(avg.tolist())

    return results


async def embed_query(text: str) -> list[float]:
    response = await _client.embeddings.create(
        model=EMBED_MODEL,
        input=text[:MAX_CHARS],   # single string
    )
    return response.data[0].embedding

async def _embed_single(text: str) -> list[float]:
    """embed a single string, halving it on context length errors until it fits"""
    while text:
        try:
            res = await _client.embeddings.create(
                model=EMBED_MODEL,
                input=text,
            )
            return res.data[0].embedding
        except BadRequestError as e:
            if 'context length' in str(e).lower() or 'input length' in str(e).lower():
                # halve and retry
                text = text[:len(text) // 2]
                if len(text) < 50:
                    return [0.0] * EMBED_DIMS
            else:
                raise

async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    
    results = []
    for text in texts:
        if not text or not text.strip():
            results.append([0.0] * EMBED_DIMS)
            continue

        if len(text) <= MAX_CHARS:
            parts = [text]
        else:
            parts = [text[i:i+MAX_CHARS] for i in range(0, len(text), MAX_CHARS - 200)]

        part_embeddings = [await _embed_single(part) for part in parts]

        if len(part_embeddings) == 1:
            results.append(part_embeddings[0])
        else:
            avg = np.mean(np.array(part_embeddings), axis=0)
            results.append(avg.tolist())

    return results

async def embed_query(text: str) -> list[float]:
    return await _embed_single(text[:MAX_CHARS])