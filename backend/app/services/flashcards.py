# app/services/flashcards.py

import math
import uuid

# sm2 algorithm
def sm2_next(interval: float, ef: float, reps: int, grade: int):
    """
    SM2 spaced repitition algorithm
    grade: 0=again, 1=hard, 2=good, 3=easy
    Returns: (next_interval_days, new_ef, new_reps)
    """
    if grade < 2:
        return 1.0, max(1.3, ef - 0.2), 0
    
    if reps == 0:
        next_interval = 1.0
    elif reps == 1:
        next_interval = 6.0
    else:
        next_interval = round(interval * ef)

    new_ef = ef + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02))
    new_ef = max(1.3, new_ef)
    new_reps = reps + 1

    if grade == 3:
        next_interval = round(next_interval * 1.3)

    return float(next_interval), new_ef, new_reps

def theta_to_initial_interval(theta: float) -> float:
    """map irt theta to sm2 starting interval in days"""
    score = 1.0 / (1.0 + math.exp(-theta))
    return max(1.0, round(score * 4))

# card generation
async def generate_flashcards(
    session_id: uuid.UUID,
    user_id: str,
    n_cards: int,
    concept: str | None,
    pool,
) -> list[dict]:
    from app.services.retrieval import build_teaching_context, resolve_material_ids
    from app.services.llm import _chat, SMART
    import json, re

    async with pool.acquire() as conn:
        material_rows = await conn.fetch(
            "SELECT material_id FROM session_materials WHERE session_id=$1",
            session_id
        )
        material_ids = [r["material_id"] for r in material_rows]
        if not material_ids:
            return []
        
        concept_focus = concept or "key concepts the student has not yet mastered"
        if not concept:
            async with pool.acquire() as conn:
                weak = await conn.fetch(
                    """SELECT concept FROM mastery_scores
                    WHERE user_id=$1 AND material_id = ANY($2::uuid[])
                    AND irt_score < 0.6
                    ORDER BY irt_score ASC LIMIT 5""",
                    uuid.UUID(user_id), material_ids
                )
            if weak:
                concept_focus = ", ".join(r["concept"] for r in weak)

        query = concept or "key concepts and definitions"
        ctx = await build_teaching_context(query, material_ids, user_id, pool)

        prompt = (
            f"Generate exactly {n_cards} flashcards from this material to help a student learn.\n\n"
            f"Source material:\n{ctx['retrieved_chunks']}\n\n"
            f"Focus on: {concept_focus}\n\n"
            "Rules:\n"
            "- Each card tests ONE specific concept or fact\n"
            "- Front: a clear question (1-2 sentences)\n"
            "- Back: a concise answer with key details (2-4 sentences)\n"
            "- Vary question types: definition, application, comparison, cause-and-effect\n"
            "- No duplicate questions\n"
            "- Respond with a JSON array ONLY. No explanation. No markdown.\n"
            '[{"concept": "...", "front": "...", "back": "...", "source_excerpt": "..."}]'
        )

        raw = await _chat(SMART, prompt, max_tokens=2000)
        raw = raw.strip().removeprefix("```json").removesuffix("```").removesuffix("```").strip()

        try:
            cards = json.loads(raw)
        except Exception:
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            cards = json.loads(match.group()) if match else []

        return [c for c in cards if isinstance(c, dict)
                and c.get("front") and c.get("back")]
    
# mastery aware due date
async def get_initial_interval(user_id: str, material_ids: list, concept: str, pool) -> float:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT theta FROM mastery_scores
               WHERE user_id=$1 AND material_id = ANY($2::uuid[]) AND concept=$3
               LIMIT 1""",
            uuid.UUID(user_id), material_ids, concept  # cast in Python
        )
    if row:
        return theta_to_initial_interval(row["theta"])
    return 1.0