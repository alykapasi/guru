# app/routers/materials.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.queue import get_queue
from app.services.storage import upload_to_minio

class RenameRequest(BaseModel):
    title: str

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("/")
async def upload_materials(
    file: UploadFile,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    material_id = uuid.uuid4()
    minio_key = f"{str(user["id"])}/{material_id}/{file.filename}"

    # 1. stream file to minio
    await upload_to_minio(minio_key, file)

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "unknown"

    # 2. insert materials row
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO materials
            (id, user_id, title, filename, file_type, minio_key, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')""",
            material_id, str(user["id"]),
            file.filename.rsplit('.', 1)[0],
            file.filename, ext, minio_key
        )

    # 3. background ingestion (non-blocking)
    queue = await get_queue()
    await queue.enqueue_job(
        'run_ingest',
        str(material_id),
        minio_key
    )

    return {"id": str(material_id), "status": "pending"}

@router.get("/")
async def list_materials(user=Depends(get_current_user), pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, title, filename, status, created_at, concepts,
                      file_type, parent_material_id, sub_doc_count, sub_doc_index, page_range
               FROM materials
               WHERE user_id=$1 AND parent_material_id IS NULL
               ORDER BY created_at DESC""",
            str(user["id"])
        )
    return [dict(r) for r in rows]

@router.get("/{material_id}")
async def get_material(
    material_id: uuid.UUID,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT *
            FROM materials
            WHERE id=$1
                AND user_id=$2
            """, material_id, str(user["id"])
        )
    if not row:
        raise HTTPException(status_code=404, detail="Material not found")
    return dict(row)

@router.get("/{material_id}/parts")
async def get_material_parts(
    material_id: uuid.UUID,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, title, status, sub_doc_index, page_range
               FROM materials
               WHERE parent_material_id=$1 AND user_id=$2
               ORDER BY sub_doc_index ASC""",
            material_id, str(user["id"])
        )
    return [dict(r) for r in rows]

@router.patch("/{material_id}/rename")
async def rename_material(
    material_id: uuid.UUID,
    req: RenameRequest,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    if not req.title.strip():
        raise HTTPException(400, "Title cannot be empty")
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE materials SET title=$1 WHERE id=$2 AND user_id=$3",
            req.title.strip(), material_id, str(user["id"])
        )
    if result == "UPDATE 0":
        raise HTTPException(404, "Material not found")
    return {"status": "renamed"}

@router.delete("/{material_id}")
async def delete_material(
    material_id: uuid.UUID,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT minio_key FROM materials
            WHERE (id=$1 OR parent_material_id=$1) AND user_id=$2
            """,
            material_id, str(user["id"])
        )
        if not rows:
            raise HTTPException(404, "Material not found")
        
        await conn.execute(
            "DELETE FROM materials WHERE (id=$1 OR parent_material_id=$1) AND user_id=$2",
            material_id, str(user["id"])
        )

    # delete from minio (best effort)
    from app.services.storage import s3
    from app.config import settings

    for row in rows:
        try:
            s3.delete_object(Bucket=settings.minio_bucket, Key=row["minio_key"])
        except Exception:
            pass

    return {"status": "deleted"}

@router.get("/chunks/{chunk_id}")
async def get_chunk(
    chunk_id: uuid.UUID,
    user=Depends(get_current_user),
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                c.id,
                c.raw_text,
                c.heading_path,
                c.chunk_index,
                c.chunk_type,
                COALESCE(parent.title, m.title) AS material_title,
                COALESCE(parent.id, m.id)       AS material_id,
                sub.page_range                  AS page_range
            FROM chunks c
            JOIN materials m ON m.id = c.material_id
            LEFT JOIN materials parent ON parent.id = m.parent_material_id
            LEFT JOIN materials sub
                ON sub.id = c.material_id
                AND sub.parent_material_id IS NOT NULL
            WHERE c.id = $1
            """,
            chunk_id
        )
    if not row:
        raise HTTPException(404, "Chunk not found")
    return dict(row)