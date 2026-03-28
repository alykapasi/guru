# app/routers/chat.py

from fastapi import APIRouter, Depends
from pydantic import BaseModel
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.prompts.chat import build_chat_system_prompt
from app.services.llm import _chat_with_system, SMART
from app.services.retrieval import build_teaching_context

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    session_id: uuid.UUID
    material_id: uuid.UUID
    message: str

@router.post("/message")
async def chat_message(
    req: ChatRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool)
):
    # 1. load convo history for this session (~last 10 turns for now)
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO sessions (id, user_id, material_id, mode)
            VALUES ($1, $2, $3, 'chat')
            ON CONFLICT (id) DO NOTHING
            """,
            req.session_id, str(user["id"]), req.material_id
        )

    async with pool.acquire() as conn:
        history = await conn.fetch(
            """SELECT role, content FROM messages
               WHERE session_id=$1 ORDER BY created_at DESC LIMIT 20""",
            req.session_id
        )
    history = list(reversed(history))

    # 2. build context
    ctx = await build_teaching_context(
        req.message, req.material_id, str(user["id"]), pool
    )

    # 3. build sys prompt
    system_prompt = build_chat_system_prompt(ctx)

    # 4. format messages for LLM API
    messages = [
        {"role": r["role"], "content": r["content"]}
        for r in history
    ] + [{"role": "user", "content": req.message}]

    # 5. call llm (will need to double check)
    reply = await _chat_with_system(
        model=SMART,
        system=system_prompt,
        messages=messages,
        max_tokens=2048,
    )

    # 6. persist both turns
    async with pool.acquire() as conn:
        for role, content, chunk_ids in [
            ("user", req.message, []),
            ("assistant", reply, ctx["chunk_ids"])
        ]:
            await conn.execute(
                """INSERT INTO messages
                   (id, session_id, role, content, chunk_ids)
                   VALUES ($1, $2, $3, $4, $5)""",
                   uuid.uuid4(), req.session_id, role, content,
                   [uuid.UUID(c) for c in chunk_ids] if chunk_ids else []
            )

    return {"reply": reply, "chunk_ids": ctx["chunk_ids"]}