# app/services/retrieval.py

import uuid

from app.services.embedding import embed_query

async def retrieve_chunks(
    query: str,
    material_ids: list[uuid.UUID],
    pool,
    top_k: int = 8,
) -> list[dict]:
    query_embedding = await embed_query(query)
    embedding_str = str(query_embedding)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                c.id,
                c.raw_text,
                c.context_text,
                c.heading_path,
                m.title AS material_title,
                1 - (c.embedding <=> $1::vector) AS similarity
            FROM chunks c
            JOIN materials m ON m.id = c.material_id
            WHERE c.material_id = ANY($2::uuid[])
            ORDER BY c.embedding <=> $1::vector
            LIMIT $3
            """,
            embedding_str, material_ids, top_k
        )
    return [dict(r) for r in rows]


def format_chunks_for_prompt(chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, 1):
        path = " > ".join(chunk["heading_path"]) if chunk["heading_path"] else "Introduction"
        title = chunk.get("material_title", "")
        parts.append(f"[Source {i}: {title} — {path}]\n{chunk['raw_text']}")
    return "\n\n---\n\n".join(parts)


async def build_teaching_context(
    query: str,
    material_ids: list[uuid.UUID],   # now a list
    user_id: str,
    pool,
) -> dict:
    resolved_ids = await resolve_material_ids(material_ids, pool)
    chunks = await retrieve_chunks(query, material_ids, pool)

    async with pool.acquire() as conn:
        profile_row = await conn.fetchrow(
            "SELECT answers FROM learner_profiles WHERE user_id=$1", user_id
        )
        mastery_rows = await conn.fetch(
            """SELECT concept, irt_score AS score FROM mastery_scores
               WHERE user_id=$1 AND material_id = ANY($2::uuid[])
               ORDER BY irt_score ASC""",
            user_id, material_ids
        )
        material_rows = await conn.fetch(
            "SELECT title, concepts FROM materials WHERE id = ANY($1::uuid[])",
            material_ids
        )

    import json
    profile_raw = profile_row["answers"] if profile_row else {}
    profile = json.loads(profile_raw) if isinstance(profile_raw, str) else dict(profile_raw)

    mastery = {r["concept"]: round(r["score"], 2) for r in mastery_rows}
    weak    = [c for c, s in mastery.items() if s < 0.6]
    strong  = [c for c, s in mastery.items() if s >= 0.8]

    all_concepts = []
    titles = []
    for r in material_rows:
        titles.append(r["title"])
        all_concepts.extend(list(r["concepts"] or []))

    return {
        "source_material_title": " + ".join(titles),
        "retrieved_chunks":      format_chunks_for_prompt(chunks),
        "chunk_ids":             [str(c["id"]) for c in chunks],
        "profile":               profile,
        "mastery":               mastery,
        "weak_concepts":         weak,
        "strong_concepts":       strong,
        "all_concepts":          all_concepts,
    }

async def resolve_material_ids(material_ids: list[uuid.UUID], pool) -> list[uuid.UUID]:
    """expand parent ids to include all ready sub-document ids"""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id FROM materials
            WHERE (id = ANY($1::uuid[]) OR parent_material_id = ANY($1::uuid[]))
            AND status = 'ready'
            """,
            material_ids
        )
    return [r["id"] for r in rows] or material_ids