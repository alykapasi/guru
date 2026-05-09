# app/routers/stats.py
from fastapi import APIRouter, Depends
from app.auth import get_current_user
from app.db import get_pool
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview")
async def get_overview(user=Depends(get_current_user), pool=Depends(get_pool)):
    uid = str(user["id"])
    async with pool.acquire() as conn:

        # Total sessions and messages
        session_row = await conn.fetchrow(
            "SELECT COUNT(*) AS total FROM sessions WHERE user_id=$1", uid
        )
        message_row = await conn.fetchrow(
            """SELECT COUNT(*) AS total FROM messages m
               JOIN sessions s ON s.id = m.session_id
               WHERE s.user_id=$1 AND m.role='user'""", uid
        )

        # Concepts mastered (irt_score >= 0.8)
        mastered_row = await conn.fetchrow(
            """SELECT COUNT(*) AS total FROM mastery_scores
               WHERE user_id=$1 AND irt_score >= 0.8""", uid
        )
        total_concepts_row = await conn.fetchrow(
            "SELECT COUNT(*) AS total FROM mastery_scores WHERE user_id=$1", uid
        )

        # Average mastery score
        avg_row = await conn.fetchrow(
            "SELECT AVG(irt_score) AS avg FROM mastery_scores WHERE user_id=$1", uid
        )

        # Flashcards reviewed total
        cards_row = await conn.fetchrow(
            """SELECT COUNT(*) AS total FROM flashcard_reviews fr
               JOIN flashcards f ON f.id = fr.card_id
               WHERE f.user_id=$1""", uid
        )

        # Streak — consecutive days with sessions up to today
        streak_rows = await conn.fetch(
            """SELECT DISTINCT DATE(started_at AT TIME ZONE 'UTC') AS day
               FROM sessions WHERE user_id=$1
               ORDER BY day DESC""", uid
        )

    # Calculate streak
    streak = 0
    today = datetime.now(timezone.utc).date()
    for i, row in enumerate(streak_rows):
        expected = today - timedelta(days=i)
        if row["day"] == expected:
            streak += 1
        else:
            break

    # Estimate study time (user messages × 45 seconds)
    messages = message_row["total"] or 0
    study_minutes = round((messages * 45) / 60)

    return {
        "streak":           streak,
        "study_minutes":    study_minutes,
        "total_sessions":   session_row["total"] or 0,
        "concepts_mastered": mastered_row["total"] or 0,
        "total_concepts":   total_concepts_row["total"] or 0,
        "avg_mastery":      round(float(avg_row["avg"] or 0), 3),
        "cards_reviewed":   cards_row["total"] or 0,
    }


@router.get("/mastery-over-time")
async def mastery_over_time(user=Depends(get_current_user), pool=Depends(get_pool)):
    uid = str(user["id"])
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                concept,
                DATE(created_at AT TIME ZONE 'UTC') AS day,
                AVG(theta_after) AS avg_theta
            FROM mastery_interactions
            WHERE user_id=$1
            GROUP BY concept, day
            ORDER BY concept, day
            """, uid
        )

    # Group by concept
    result = {}
    for r in rows:
        concept = r["concept"]
        if concept not in result:
            result[concept] = []
        score = round(1.0 / (1.0 + __import__('math').exp(-float(r["avg_theta"]))), 3)
        result[concept].append({
            "day":   r["day"].isoformat(),
            "score": score,
        })

    # Return top 8 concepts by number of interactions (most studied)
    sorted_concepts = sorted(result.items(), key=lambda x: len(x[1]), reverse=True)[:8]
    return [{"concept": k, "data": v} for k, v in sorted_concepts]


@router.get("/by-material")
async def by_material(user=Depends(get_current_user), pool=Depends(get_pool)):
    uid = str(user["id"])
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                COALESCE(parent.title, m.title) AS material_title,
                COALESCE(parent.id, m.id)       AS material_id,
                COUNT(ms.concept)               AS concept_count,
                AVG(ms.irt_score)               AS avg_score,
                COUNT(*) FILTER (WHERE ms.irt_score >= 0.8) AS mastered,
                COUNT(*) FILTER (WHERE ms.irt_score < 0.6)  AS weak
            FROM mastery_scores ms
            JOIN materials m      ON m.id = ms.material_id
            LEFT JOIN materials parent ON parent.id = m.parent_material_id
            WHERE ms.user_id=$1
            GROUP BY material_title, material_id
            ORDER BY avg_score DESC
            """, uid
        )
    return [dict(r) for r in rows]


@router.get("/activity")
async def activity(user=Depends(get_current_user), pool=Depends(get_pool)):
    uid = str(user["id"])
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                DATE(started_at AT TIME ZONE 'UTC') AS day,
                COUNT(*) AS session_count
            FROM sessions
            WHERE user_id=$1
            AND started_at >= NOW() - INTERVAL '90 days'
            GROUP BY day
            ORDER BY day
            """, uid
        )
    return [{"day": r["day"].isoformat(), "count": r["session_count"]} for r in rows]


@router.get("/weak-concepts")
async def weak_concepts(user=Depends(get_current_user), pool=Depends(get_pool)):
    uid = str(user["id"])
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                ms.concept,
                ms.irt_score,
                ms.attempts,
                ms.last_quiz_at,
                COALESCE(parent.title, m.title) AS material_title,
                COALESCE(parent.id, m.id)       AS material_id
            FROM mastery_scores ms
            JOIN materials m ON m.id = ms.material_id
            LEFT JOIN materials parent ON parent.id = m.parent_material_id
            WHERE ms.user_id=$1
            ORDER BY ms.irt_score ASC
            LIMIT 10
            """, uid
        )
    return [dict(r) for r in rows]


@router.get("/quiz-history")
async def quiz_history(user=Depends(get_current_user), pool=Depends(get_pool)):
    uid = str(user["id"])
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                DATE(submitted_at AT TIME ZONE 'UTC') AS day,
                AVG(score) AS avg_score,
                COUNT(*)   AS count
            FROM quiz_attempts
            WHERE user_id=$1 AND submitted_at IS NOT NULL
            GROUP BY day
            ORDER BY day
            """, uid
        )
    return [{"day": r["day"].isoformat(), "score": round(float(r["avg_score"]), 3), "count": r["count"]} for r in rows]