# app/services/mastery.py

import uuid

HISTORY_WEIGHT = 0.7
NEW_WEIGHT = 0.3

async def update_mastery(user_id, material_id, graded_quiz: dict, pool):
    """Update concept mastery scores after a quiz submission."""
    # group scores by concept
    concept_scores: dict[str, list[float]] = {}
    for r in graded_quiz["results"]:
        concept = r["concept"]
        concept_scores.setdefault(concept, []).append(r["score"])

    async with pool.acquire() as conn:
        for concept, scores in concept_scores.items():
            quiz_score = sum(scores) / len(scores)

            # upsert: update if exists, insert if not
            await conn.execute(
                """
                INSERT INTO mastery_scores (user_id, material_id, concept, score, attempts, last_tested)
                VALUES ($1, $2, $3, $4, 1, NOW())
                ON CONFLICT (user_id, material_id, concept) DO UPDATE SET
                    score = mastery_scores.score * $5 + EXCLUDED.score * $6,
                    attempts = mastery_scores.attempts + 1,
                    last_tested = NOW()
                """,
                user_id, material_id, concept, quiz_score, HISTORY_WEIGHT, NEW_WEIGHT
            )