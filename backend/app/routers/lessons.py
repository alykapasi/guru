# app/routers/lessons.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid, json

from app.auth import get_current_user
from app.db import get_pool
from app.services.llm import _chat, SMART, FAST
from app.services.retrieval import build_teaching_context

router = APIRouter(prefix="/lesson", tags=["lesson"])

class LessonRequest(BaseModel):
    session_id: uuid.UUID
    topic: str | None = None # None = generate lesson on full material

class ChecklistRequest(BaseModel):
    session_id: uuid.UUID
    goal: str

@router.post("/generate")
async def generate_lesson(
    req: LessonRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        material_rows = await conn.fetch(
            "SELECT material_id FROM session_materials WHERE session_id=$1",
            req.session_id
        )
    material_ids = [r["material_id"] for r in material_rows]
    if not material_ids:
        raise HTTPException(400, "No materials in this section")
    
    query = req.topic or "overview of the main topics in this material"
    ctx = await build_teaching_context(query, material_ids, str(user["id"]), pool)

    from app.prompts.lesson import build_lesson_prompt
    prompt = build_lesson_prompt(ctx, req.topic)

    response = await _chat(
        model=SMART,
        prompt=prompt,
        max_tokens=4096,
    )

    return {"lesson_markdown": response}

@router.post("/checklist")
async def generate_checklist(req: ChecklistRequest, user=Depends(get_current_user), pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        material_rows = await conn.fetch(
            """SELECT m.title, m.concepts
               FROM session_materials sm
               JOIN materials m ON m.id = sm.material_id
               WHERE sm.session_id=$1""",
            req.session_id
        )
    if not material_rows:
        raise HTTPException(404, "No materials found for this session")

    # Combine titles and concepts across all materials
    titles    = [r["title"] for r in material_rows]
    concepts  = []
    for r in material_rows:
        concepts.extend(list(r["concepts"] or []))
    concepts = list(dict.fromkeys(concepts))[:20]  # deduplicate, cap at 20

    titles_str   = " + ".join(titles)
    concepts_str = ", ".join(concepts)

    prompt = (
        f"A student wants to study '{titles_str}' with this goal: \"{req.goal}\"\n\n"
        f"Available concepts: {concepts_str}\n\n"
        "Generate a focused session checklist of 3-5 specific, actionable items "
        "the student should accomplish in this single study session.\n\n"
        "Rules:\n"
        "- Each item should be completable in one session\n"
        "- Be specific, not vague\n"
        "- Respond with a JSON array of strings ONLY. No explanation. No markdown."
    )
    raw = await _chat(FAST, prompt, max_tokens=300)
    raw = raw.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()

    try:
        start = raw.find('[')
        if start == -1:
            items = []
        else:
            depth, end = 0, -1
            for idx, ch in enumerate(raw[start:], start):
                if ch == '[': depth += 1
                elif ch == ']':
                    depth -= 1
                    if depth == 0:
                        end = idx + 1
                        break
            if end == -1:
                fragment = raw[start:].rstrip().rstrip(',')
                last = fragment.rfind('",')
                fragment = (fragment[:last+1] + ']') if last > 0 else '[]'
            else:
                fragment = raw[start:end]
            items = json.loads(fragment)
    except Exception:
        items = []

    return {"checklist": items}