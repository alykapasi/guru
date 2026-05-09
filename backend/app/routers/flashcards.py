# app/routers/flashcards.py

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.services.flashcards import generate_flashcards, get_initial_interval, sm2_next
from app.services.mastery import DIFFICULTY_BETA, aggregate_score, theta_to_score, update_theta

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

class GenerateRequest(BaseModel):
    session_id: uuid.UUID
    concept: str | None = None
    n_cards: int = 10

class ReviewRequest(BaseModel):
    grade: int # 0=again, 1=hard, 2=good, 3=easy

@router.post("/generate")
async def generate(
    req: GenerateRequest,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    cards = await generate_flashcards(
        req.session_id, str(user["id"]), req.n_cards, req.concept, pool
    )
    if not cards:
        raise HTTPException(400, "Could not generate flashcards")
    
    async with pool.acquire() as conn:
        material_rows = await conn.fetch(
            "SELECT material_id FROM session_materials WHERE session_id=$1",
            req.session_id
        )
    material_ids = [r["material_id"] for r in material_rows]
    primary_material_id = material_ids[0]

    saved = []
    async with pool.acquire() as conn:
        for card in cards:
            concept = card.get("concept", "General")

            existing = await conn.fetchrow(
                """
                SELECT id FROM flashcards
                WHERE user_id=$1 AND material_id=$2 AND front=$3
                """,
                str(user["id"]), primary_material_id, card["front"]
            )
            if existing:
                continue

            interval = await get_initial_interval(
                str(user["id"]), material_ids, concept, pool
            )
            due_at = datetime.now(timezone.utc) + timedelta(days=interval)
            card_id = uuid.uuid4()

            await conn.execute(
                """
                INSERT INTO flashcards (
                    id, user_id, material_id, concept, front, back,
                    interval, ease_factor, repetitions, due_at
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                card_id, str(user["id"]), primary_material_id,
                concept, card["front"], card["back"],
                interval, 2.5, 0, due_at
            )
            saved.append({
                "id": str(card_id),
                "concept": concept,
                "front": card["front"],
                "back": card["back"],
                "due_at": due_at.isoformat(),
                "interval": interval,
            })

    return {"cards": saved, "generated": len(saved)}

@router.get("/due")
async def get_due(
    session_id: uuid.UUID | None = None,
    limit: int = 20,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        if session_id:
            material_rows = await conn.fetch(
                "SELECT material_id FROM session_materials WHERE session_id=$1",
                session_id
            )
            material_ids = [r["material_id"] for r in material_rows]
            if not material_ids:
                return []
            rows = await conn.fetch(
                """SELECT id, concept, front, back, interval, ease_factor,
                          repetitions, due_at, last_reviewed
                   FROM flashcards
                   WHERE user_id=$1 AND material_id = ANY($2::uuid[])
                   AND due_at <= NOW()
                   ORDER BY due_at ASC
                   LIMIT $3""",
                str(user["id"]), material_ids, limit
            )
        else:
            rows = await conn.fetch(
                """SELECT id, concept, front, back, interval, ease_factor,
                          repetitions, due_at, last_reviewed
                   FROM flashcards
                   WHERE user_id=$1 AND due_at <= NOW()
                   ORDER BY due_at ASC
                   LIMIT $2""",
                str(user["id"]), limit
            )
    return [dict(r) for r in rows]

@router.get("/all")
async def get_all(
    session_id: uuid.UUID | None = None,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        if session_id:
            material_rows = await conn.fetch(
                "SELECT material_id FROM session_materials WHERE session_id=$1",
                session_id
            )
            material_ids = [r["material_id"] for r in material_rows]
            rows = await conn.fetch(
                """
                SELECT
                    id, concept, front, back, interval, ease_factor,
                    repetitions, due_at, last_reviewed
                FROM flashcards
                WHERE user_id=$1 AND material_id = ANY($2::uuid[])
                ORDER BY concept, due_at
                """,
                str(user["id"]), material_ids
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    id, concept, front, back, interval, ease_factor,
                    repetitions, due_at, last_reviewed
                FROM flashcards
                WHERE user_id=$1
                ORDER BY due_at ASC
                """,
                str(user["id"])
            )
    return [dict(r) for r in rows]

@router.post("/{card_id}/review")
async def review_card(
    card_id: uuid.UUID,
    req: ReviewRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    if req.grade not in (0, 1, 2, 3):
        raise HTTPException(400, "Grade must be 0-3")
    
    async with pool.acquire() as conn:
        card = await conn.fetchrow(
            "SELECT * FROM flashcards WHERE id=$1 AND user_id=$2",
            card_id, str(user["id"])
        )
    if not card:
        raise HTTPException(404, "Card not found")
    
    # sm2 update
    new_interval, new_ef, new_reps = sm2_next(
        card["interval"], card["ease_factor"], card["repetitions"], req.grade
    )
    due_at = datetime.now(timezone.utc) + timedelta(days=new_interval)

    # irt update
    correct = req.grade >= 2
    beta = DIFFICULTY_BETA.get("medium", 0.0)

    async with pool.acquire() as conn:
        mastery_row = await conn.fetchrow(
            """
            SELECT theta, irt_score, llm_score, self_score
            FROM mastery_scores
            WHERE user_id=$1::uuid AND material_id=$2 AND concept=$3
            """,
            str(user["id"]), card["material_id"], card["concept"]
        )

    theta_before = mastery_row["theta"] if mastery_row else 0.0
    theta_after = update_theta(theta_before, beta, correct)
    new_irt_score = theta_to_score(theta_after)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE flashcards SET
                interval=$1, ease_factor=$2, repetitions=$3,
                due_at=$4, last_reviewed=NOW()
            WHERE id=$5
            """,
            new_interval, new_ef, new_reps, due_at, card_id
        )

        if mastery_row:
            await conn.execute(
                """
                UPDATE mastery_scores SET
                    theta=$1, irt_score=$2, last_updated=NOW()
                WHERE user_id=$3 AND material_id=$4 AND concept=$5
                """,
                theta_after, new_irt_score, str(user["id"]), card["material_id"], card["concept"]
            )

        await conn.execute(
            """
            INSERT INTO flashcard_reviews (
                id, user_id, card_id, grade, interval_before, interval_after,
                theta_before, theta_after)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            """,
            uuid.uuid4(), str(user["id"]), card_id, req.grade,
            card["interval"], new_interval, theta_before, theta_after
        )

        await conn.execute(
            """
            INSERT INTO mastery_interactions (
                id, user_id, material_id, concept, interaction_type,
                correct, score, theta_before, theta_after)
            VALUES ($1,$2,$3,$4,'flashcard',$5,$6,$7,$8)
            """,
            uuid.uuid4(), str(user["id"]), card["material_id"],
            card["concept"], correct, 1.0 if correct else 0.0,
            theta_before, theta_after
        )

    return {
        "card_id": str(card_id),
        "new_interval": new_interval,
        "new_ef": new_ef,
        "new_reps": new_reps,
        "due_at": due_at.isoformat(),
        "theta_before": theta_before,
        "theta_after": theta_after,
        "irt_score": new_irt_score,
    }

@router.delete("/{card_id}")
async def delete_card(
    card_id: uuid.UUID,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM flashcards WHERE id=$1 AND user_id=$2",
            card_id, str(user["id"])
        )
    if result == "DELETE 0":
        raise HTTPException(404, "Card not found")
    return {"status": "deleted"}