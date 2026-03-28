# app/routers/profile.py

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_pool

router = APIRouter(prefix="/profile", tags=["profile"])
class OnboardingAnswers(BaseModel):
    background: str     # beginner | some | familiar | expert
    learn_style: str    # examples | problems | visual | analogies | facts
    goal: str           # exam | deep | overview | work
    session_length: str # lt15 | 15-30 | 30-60 | gt60
    tone: str           # concise | detailed | conversational | formal

@router.post("/onboarding")
async def save_onboarding(
    answers: OnboardingAnswers,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    import json
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO learner_profiles (user_id, answers)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (user_id) DO UPDATE SET answers=$2::jsonb,
            updated_at=NOW()
            """, str(user["id"]), json.dumps(answers.model_dump())
        )
    return {"status": "saved"}

@router.get("/")
async def get_profile(
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT answers, updated_at
            FROM learner_profiles
            WHERE user_id=$1
            """, str(user["id"])
        )
    if not row:
        return {"answers": None}
    return {"answers": dict(row["answers"]), "updated_at": row["updated_at"]}