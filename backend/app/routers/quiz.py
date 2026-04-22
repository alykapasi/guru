# app/routers/quiz.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid, json, re

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
async def generate_quiz(req: QuizRequest, user=Depends(get_current_user), pool=Depends(get_pool)):
    # get materials from session
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT id FROM sessions WHERE id=$1 AND user_id=$2",
            req.session_id, str(user["id"])
        )
        if not session:
            raise HTTPException(404, "Session not found")
        material_rows = await conn.fetch(
            "SELECT material_id FROM session_materials WHERE session_id=$1",
            req.session_id
        )

    material_ids = [r["material_id"] for r in material_rows]
    if not material_ids:
        raise HTTPException(400, "No materials in this session")
    
    query = req.topic or "key concepts across the all materials"
    ctx = await build_teaching_context(query, req.material_id, str(user["id"]), pool)

    from app.prompts.quiz import build_quiz_prompt
    prompt = build_quiz_prompt(ctx, req.topic, req.n_questions)

    reply = await _chat(model=SMART, prompt=prompt, max_tokens=3000)
    raw = reply.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        quiz_data = json.loads(raw)
    except json.JSONDecodeError:
        # Try extracting just the array
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        quiz_data = json.loads(match.group()) if match else []

    # Normalise — guarantee every question has id, type, concept
    normalised = []
    for i, q in enumerate(quiz_data):
        if not isinstance(q, dict):
            continue
        normalised.append({
            "id": q.get("id") or f"q{i}",
            "type": q.get("type") or "mcq",
            "concept": q.get("concept") or "General",
            "question": q.get("question") or "",
            "options": q.get("options") or {},
            "correct": q.get("correct") or q.get("correct_answer") or q.get("answer") or "",
            "ideal_answer": q.get("ideal_answer") or q.get("answer") or "",
            "difficulty": q.get("difficulty") or "medium",
        })

    attempt_id = uuid.uuid4()
    primary_material_id = material_ids[0]
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO quiz_attempts (id, user_id, session_id, material_id, questions) VALUES($1,$2,$3,$4,$5)",
            attempt_id, str(user["id"]), req.session_id, primary_material_id, json.dumps(normalised)
        )
    return {"attempt_id": str(attempt_id), "quiz": normalised}

@router.post("/submit")
async def submit_quiz(req: QuizSubmission, user=Depends(get_current_user), pool=Depends(get_pool)):
    # load quiz
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM quiz_attempts WHERE id=$1", req.quiz_attempt_id)
    
    if not row:
        raise HTTPException(404, "Quiz attempt not found")
    
    questions = json.loads(row["questions"])

    from app.services.grading import grade_quiz
    graded = await grade_quiz(questions, req.answers)

    from app.services.mastery import update_mastery
    await update_mastery(str(user["id"]), row["material_id"], graded, pool)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE quiz_attempts SET score=$1, submitted_at=NOW() WHERE id=$2",
            graded["overall_score"], req.quiz_attempt_id
        )
    return graded