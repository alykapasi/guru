# app/routers/lessons.py

from fastapi import APIRouter, Depends, HTTPException
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

class ChecklistRequest(BaseModel):
    material_id: uuid.UUID
    goal: str

@router.post("/generate")
async def generate_lesson(
    req: LessonRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    query = req.topic or "overview of the main topics in this material"
    ctx = await build_teaching_context(query, req.material_id, str(user["id"]), pool)

    from app.prompts.lesson import build_lesson_prompt
    prompt = build_lesson_prompt(ctx, req.topic)

    response = await _chat(
        model = SMART,
        prompt=prompt,
        max_tokens=4096,
    )

    return {"lesson_markdown": response}

@router.post("/checklist")
async def generate_checklist(
    req: ChecklistRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        material = await conn.fetchrow(
            "SELECT title, concepts FROM materials WHERE id=$1",
            req.material_id
        )
    if not material:
        raise HTTPException(404, "Material not found")
    
    concepts = list(material["concepts"] or [])[:15]
    prompt = (
        f"A student wants to study '{material['title']}' with this goal: \"{req.goal}\"\n\n"
        f"Available concepts in this material: {', '.join(concepts)}\n\n"
        "Generate a focused session checklist of 3-5 specific, actionable items "
        "the student should accomplish in this single study session to make progress toward their goal.\n\n"
        "Rules:\n"
        "- Each item should be completable in one session\n"
        "- Be specific, not vague ('Understand how osmosis works' not 'Learn biology')\n"
        "- Respond with a JSON array of strings ONLY. No explanation. No markdown.\n"
        "Example: [\"Understand the role of ATP in cellular respiration\", \"Be able to explain the Krebs cycle\"]"
    )
    from app.services.llm import _chat, FAST
    import json
    raw = await _chat(FAST, prompt, max_tokens=300)
    # In app/routers/lessons.py generate_checklist, replace the try/except block:
    try:
        # Strip fences
        raw = raw.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()
        
        # Find the array and extract complete strings only
        start = raw.find('[')
        if start == -1:
            items = []
        else:
            # Find matching close bracket
            depth = 0
            end = -1
            for idx, ch in enumerate(raw[start:], start):
                if ch == '[': depth += 1
                elif ch == ']':
                    depth -= 1
                    if depth == 0:
                        end = idx + 1
                        break
            
            if end == -1:
                # Truncated — close it manually
                fragment = raw[start:].rstrip().rstrip(',')
                # Remove last incomplete item if it ends mid-string
                last_complete = fragment.rfind('",')
                if last_complete > 0:
                    fragment = fragment[:last_complete+1] + ']'
                else:
                    fragment = fragment + ']' if fragment.endswith('"') else '[]'
            else:
                fragment = raw[start:end]
            
            try:
                items = json.loads(fragment)
            except Exception:
                items = []
    except Exception:
        items = []

    return {"checklist": items}