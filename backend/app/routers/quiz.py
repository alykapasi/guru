# app/routers/quiz.py

from fastapi import APIRouter, Depends
from pydantic import BaseModel
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.services.llm import _chat, SMART
from app.services.retrieval import build_teaching_context

router = APIRouter(prefix="/quiz", tags=["quiz"])

class QuizRequest(BaseModel):
    material_id: uuid.UUID
    topic: str | None = None
    n_questions: int = 8

class QuizSubmission(BaseModel):
    quiz_attempt_id: uuid.UUID
    answers: dict[str, str]

@router.post("/generate")
async def generate_quiz(
    req: QuizRequest,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    query = req.topic or "key concepts across the whole material"
    ctx = await build_teaching_context(query, req.material_id, user.id, pool)

    from app.prompts.quiz import build_quiz_prompt
    prompt = build_quiz_prompt(ctx, req.topic, req.n_questions)