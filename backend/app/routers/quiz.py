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
    session_id: uuid.UUID
    topic: str | None = None
    n_questions: int = 8

class QuizSubmission(BaseModel):
    quiz_attempt_id: uuid.UUID
    answers: dict[str, str]
    
class ClozeRequest(BaseModel):
    session_id: uuid.UUID
    topic: str | None = None
    n_exercises: int = 5

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
    ctx = await build_teaching_context(query, material_ids, str(user["id"]), pool)

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

@router.post("/cloze/generate")
async def generate_cloze(
    req: ClozeRequest,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
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
    
    query = req.topic or "key concepts and definitions"
    ctx = await build_teaching_context(query, material_ids, str(user["id"]), pool)

    prompt = (
        f"Generate exactly {req.n_exercises} fill-in-the-blank exercises from this material.\n\n"
        f"Source material:\n{ctx['retrieved_chunks']}\n\n"
        f"Topic focus: {req.topic or 'key concepts'}\n\n"
        "For each exercise, choose the variant based on complexity:\n"
        "- Simple (one blank): for single terms, names, formulas — easier concepts\n"
        "- Multi-cloze (2-3 blanks): for relationships, processes, cause-and-effect — harder concepts\n\n"
        "Rules:\n"
        "- Use ___ for each blank in the passage\n"
        "- Blanks must be key terms, not filler words\n"
        "- The passage must be a complete, meaningful sentence from or based on the material\n"
        "- Keep passages concise (1-2 sentences)\n"
        "- Respond with JSON array ONLY:\n"
        '[{"concept":"...","passage":"The ___ measures risk-adjusted returns relative to ___.","blanks":["Sharpe ratio","benchmark"],"difficulty":"medium","hint":"optional short hint"}]'
    )

    from app.services.llm import SMART, _chat
    import json, re
    raw = await _chat(SMART, prompt, max_tokens=2000)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        exercises = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        exercises = json.loads(match.group()) if match else []

    normalized = []
    for i, ex in enumerate(exercises):
        if not isinstance(ex, dict): continue
        blanks = ex.get("blanks", [])
        if not blanks: continue
        normalized.append({
            "id"            : f"c{i}",
            "concept"       : ex.get("concept", "General"),
            "passage"       : ex.get("passage", ""),
            "blanks"        : blanks,
            "n_blanks"      : len(blanks),
            "difficulty"    : ex.get("difficulty", "medium"),
            "hint"          : ex.get("hint"),
        })

    attempt_id = uuid.uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, user_id, session_id, material_id, questions)
            VALUES ($1,$2,$3,$4,$5)
            """,
            attempt_id, str(user["id"]), req.session_id,
            material_ids[0], json.dumps(normalized)
        )

    return {"attempt_id": str(attempt_id), "exercises": normalized}

@router.post("/cloze/submit")
async def submit_cloze(
    req: QuizSubmission,   # reuse same model — answers dict keyed by exercise id
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM quiz_attempts WHERE id=$1", req.quiz_attempt_id
        )
    if not row:
        raise HTTPException(404, "Attempt not found")

    import json
    exercises = json.loads(row["questions"])

    results = []
    for ex in exercises:
        eid = ex["id"]
        blanks = ex["blanks"]
        user_answers = req.answers.get(eid, "").split("|||")  # blanks separated by |||

        blank_results = []
        all_correct = True
        for j, (expected, given) in enumerate(zip(blanks, user_answers)):
            # Normalise comparison
            exp_norm = expected.lower().strip().rstrip(".,;")
            given_norm = given.lower().strip().rstrip(".,;")
            correct = exp_norm == given_norm or given_norm in exp_norm or exp_norm in given_norm
            blank_results.append({
                "expected": expected,
                "given":    given,
                "correct":  correct,
            })
            if not correct:
                all_correct = False

        score = sum(1 for b in blank_results if b["correct"]) / len(blank_results)
        results.append({
            "exercise_id": eid,
            "concept":     ex["concept"],
            "score":       round(score, 2),
            "blank_results": blank_results,
            "correct_answer": " / ".join(blanks),
        })

    overall = sum(r["score"] for r in results) / len(results) if results else 0

    # Update mastery
    graded = {"results": results, "overall_score": overall}
    from app.services.mastery import update_mastery
    await update_mastery(str(user["id"]), row["material_id"], graded, pool)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE quiz_attempts SET score=$1, submitted_at=NOW() WHERE id=$2",
            overall, req.quiz_attempt_id
        )

    return {"results": results, "overall_score": round(overall, 3)}