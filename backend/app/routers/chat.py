# app/routers/chat.py

from fastapi import APIRouter, Depends, HTTPException
import json
from pydantic import BaseModel
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.prompts.chat import build_chat_system_prompt
from app.services.llm import _chat_with_system, SMART
from app.services.retrieval import build_teaching_context

router = APIRouter(prefix="/chat", tags=["chat"])

class SessionCreateRequest(BaseModel):
    material_ids: list[uuid.UUID]
    goal: str

class AddMaterialRequest(BaseModel):
    material_id: uuid.UUID

class ChatRequest(BaseModel):
    session_id: uuid.UUID
    message: str

@router.post("/sessions/create")
async def create_session(
    req: SessionCreateRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    if not req.material_ids:
        raise HTTPException(400, "At least one material required")
    
    session_id = uuid.uuid4()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id FROM materials
            WHERE id = ANY($1::uuid[])
            AND user_id = $2
            AND status = 'ready'
            """,
            req.material_ids, str(user["id"])
        )
        if len(rows) != len(req.material_ids):
            raise HTTPException(400, "One or more materials not found or not ready")
        
        await conn.execute(
            "INSERT INTO sessions (id, user_id, mode) VALUES ($1, $2, 'chat')",
            session_id, str(user["id"])
        )
        for mid in req.material_ids:
            await conn.execute(
                "INSERT INTO session_materials (session_id, material_id) VALUES ($1, $2)",
                session_id, mid
            )

    return {"session_id": str(session_id)}

@router.post("/sessions/{session_id}/materials")
async def add_material_to_session(
    session_id: uuid.UUID,
    req: AddMaterialRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT id FROM sessions WHERE id=$1 AND user_id=$2",
            session_id, str(user["id"])
        )
        if not session:
            raise HTTPException(404, "Session not found")
        
        material = await conn.fetchrow(
            "SELECT id FROM materials WHERE id=$1 AND user_id=$2 AND status='ready'",
            req.material_id, str(user["id"])
        )
        if not material:
            raise HTTPException(404, "Material not found or not ready")
        
        # upsert - safe to call even if already added
        await conn.execute(
            """
            INSERT INTO session_materials (session_id, material_id)
            VALUES ($1, $2) ON CONFLICT DO NOTHING
            """,
            session_id, req.material_id
        )
    return {"status": "added"}

@router.post("/message")
async def chat_message(
    req: ChatRequest,
    user = Depends(get_current_user),
    pool = Depends(get_pool)
):
    # 1. Load session + materials + history — acquire and release immediately
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
        history = await conn.fetch(
            """SELECT role, content FROM messages
               WHERE session_id=$1 ORDER BY created_at DESC LIMIT 20""",
            req.session_id
        )

    material_ids = [r["material_id"] for r in material_rows]
    if not material_ids:
        raise HTTPException(400, "No materials attached to this session")

    history = list(reversed(history))

    # 2. Build context — acquires and releases its own connection internally
    ctx = await build_teaching_context(req.message, material_ids, str(user["id"]), pool)

    # 3. LLM call — no DB connection held
    system_prompt = build_chat_system_prompt(ctx)
    messages = [
        {"role": r["role"], "content": r["content"]} for r in history
    ] + [{"role": "user", "content": req.message}]

    reply = await _chat_with_system(
        model=SMART, system=system_prompt,
        messages=messages, max_tokens=2048
    )

    # 4. Resolve citations — pure in-memory, no DB needed
    from app.services.citations import resolve_citations
    citations = resolve_citations(reply, ctx["chunks"])

    # 5. Persist both turns
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO messages (id, session_id, role, content, chunk_ids, citations)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            uuid.uuid4(), req.session_id, 'user', req.message, [], '[]'
        )
        await conn.execute(
            """INSERT INTO messages (id, session_id, role, content, chunk_ids, citations)
            VALUES ($1, $2, $3, $4, $5, $6)""",
            uuid.uuid4(), req.session_id, 'assistant', reply,
            [uuid.UUID(c) for c in ctx["chunk_ids"]] if ctx["chunk_ids"] else [],
            json.dumps(citations)
        )
        msg_count = await conn.fetchval(
            "SELECT COUNT(*) FROM messages WHERE session_id=$1 AND role='assistant'",
            req.session_id
        )

    # 6. Trigger chat assessment every 5 messages (fire and forget)
    if msg_count % 5 == 0:
        import asyncio
        from app.services.mastery import assess_chat_mastery
        asyncio.create_task(assess_chat_mastery(req.session_id, material_ids, pool))

    return {
        "reply":     reply,
        "citations": citations,
        "chunk_ids": ctx["chunk_ids"],
    }
    
@router.get("/sessions")
async def list_sessions(
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                s.id,
                s.mode,
                s.started_at,
                COUNT(DISTINCT msg.id) AS message_count,
                MAX(msg.created_at) AS last_message_at,
                ARRAY_AGG(DISTINCT m.title) FILTER (WHERE m.title IS NOT NULL) AS material_titles,
                ARRAY_AGG(DISTINCT sm.material_id) FILTER (WHERE sm.material_id IS NOT NULL) AS material_ids
            FROM sessions s
            LEFT JOIN session_materials sm ON sm.session_id = s.id
            LEFT JOIN materials m ON m.id = sm.material_id
            LEFT JOIN messages msg ON msg.session_id = s.id
            WHERE s.user_id = $1
            GROUP BY s.id
            ORDER BY COALESCE(MAX(msg.created_at), s.started_at) DESC
            """, str(user["id"])
        )
    return [dict(r) for r in rows]

@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: uuid.UUID,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    import json
    async with pool.acquire() as conn:
        messages = await conn.fetch(
            """SELECT role, content, citations, created_at
               FROM messages WHERE session_id=$1
               ORDER BY created_at ASC""",
            session_id
        )
    return [
        {
            **dict(m),
            "citations": json.loads(m["citations"]) if isinstance(m["citations"], str) else (m["citations"] or [])
        }
        for m in messages
    ]

@router.post("/debug-retrieval")
async def debug_retrieval(req: ChatRequest, user=Depends(get_current_user), pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        material_rows = await conn.fetch(
            "SELECT material_id FROM session_materials WHERE session_id=$1", req.session_id
        )
    material_ids = [r["material_id"] for r in material_rows]
    ctx = await build_teaching_context(req.message, material_ids, str(user["id"]), pool)
    return {
        "chunk_count": len(ctx["chunks"]),
        "prompt_preview": ctx["retrieved_chunks"][:500],  # first 500 chars
        "citations_possible": len(ctx["chunks"]) > 0,
    }