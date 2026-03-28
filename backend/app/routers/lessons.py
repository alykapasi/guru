# app/routers/lessons.py

from fastapi import APIRouter, Depends
from pydantic import BaseModel
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.services.llm import _chat, SMART
from app.services.retrieval import build_teaching_context

router = APIRouter(prefix="/lesson", tags=["lesson"])

class LessonRequest(BaseModel):
    material_id: uuid.UUID
    topic: str | None = None # None = generate lesson on full material

@router.post("/generate")
async def generate_lesson(
    req: LessonRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    query = req.topic or "overview of the main topics in this material"
    ctx = await build_teaching_context(query, req.material_id, user["id"], pool)

    from app.prompts.lesson import build_lesson_prompt
    prompt = build_lesson_prompt(ctx, req.topic)

    response = await _chat(
        model = SMART,
        prompt=prompt,
        max_tokens=4096,
    )

    return {"lesson_markdown": response}