# app/services/retrieval.py

import uuid

from app.services.embedding import embed_query

async def retrieve_chunks(
        query: str,
        material_id: uuid.UUID,
        pool,
        top_k: int = 6,
) -> list[dict]:
    """
    retrieve the top_k most relevant chunks for a query
    returns chunks with their text and heading_path
    """
    query_embedding = await embed_query(query)
    embedding_str = str(query_embedding)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT  
                id,
                raw_text,
                context_text,
                heading_path,
                1 - (embedding <=> $1::vector) AS similarity
            FROM chunks
            WHERE material_id = $2
            ORDER BY embedding <=> $1::vector
            LIMIT $3
            """,
            embedding_str, material_id, top_k
        )
    return [dict(r) for r in rows]

def format_chunks_for_prompt(chunks: list[dict]) -> str:
    """Format retrieved chunks into a clean prompt-ready string"""
    parts = []
    for i, chunk in enumerate(chunks, 1):
        path = " > ".join(chunk["heading_path"]) if chunk["heading_path"] else "Introduction"
        parts.append(
            f"[Source {i}: {path}]\n{chunk["raw_text"]}"
        )
    return "\n\n---\n\n".join(parts)

async def build_teaching_context(
        query: str,
        material_id: uuid.UUID,
        user_id: uuid.UUID,
        pool,
) -> dict:
    """Build the full context dict for any teaching LLM call."""
    # retrive relevant chunks
    chunks = await retrieve_chunks(query, material_id, pool)

    # get learner profile
    async with pool.acquire() as conn:
        profile_row = await conn.fetchrow(
            "SELECT answers FROM learner_profiles WHERE user_id=$1", user_id
        )
        mastery_rows = await conn.fetch(
            """SELECT concept, score FROM mastery_scores
               WHERE user_id=$1 AND material_id=$2
               ORDER BY score ASC""",
            user_id, material_id
        )
        material_row = await conn.fetchrow(
            "SELECT title, concepts FROM materials WHERE id=$1", material_id
        )

    profile = dict(profile_row["answers"]) if profile_row else {}
    mastery = {r["concept"]: round(r["score"], 2) for r in mastery_rows}
    weak = [c for c, s in mastery.items() if s < 0.6]
    strong = [c for c, s in mastery.items() if s >= 0.8]

    return {
        "source_material_title": material_row["title"] if material_row else "",
        "retrieved_chunks": format_chunks_for_prompt(chunks),
        "chunk_ids": [str(c["id"]) for c in chunks],
        "profile": profile,
        "mastery": mastery,
        "weak_concepts": weak,
        "strong_concepts": strong,
        "all_concepts": list(material_row["concepts"]) if material_row else [],
    }