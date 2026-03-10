# app/services/embedding.py

import voyageai

from app.config import settings

vo = voyageai.AsyncClient(api_key=settings.voyage_api_key)

EMBED_MODEL = "voyage-3"
EMBED_DIMS = 1024
BATCH_SIZE = 128

async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts in batches; returns a list of 1024 dim vectors"""
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i+BATCH_SIZE]
        result = await vo.embed(batch, model=EMBED_MODEL, input_type="document")
        all_embeddings.extend(result.embeddings)
    return all_embeddings

async def embed_query(text: str) -> list[float]:
    """Embed a single query string, NOTE: use input_type='query' for queries"""
    result = await vo.embed([text], model=EMBED_MODEL, input_type='query')
    return result.embeddings[0]