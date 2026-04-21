# app/routers/materials.py

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
import uuid

from app.auth import get_current_user
from app.db import get_pool
from app.services.storage import upload_to_minio
from app.services.ingestion import ingest_material

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("/")
async def upload_materials(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    material_id = uuid.uuid4()
    minio_key = f"{str(user["id"])}/{material_id}/{file.filename}"

    # 1. stream file to minio
    await upload_to_minio(minio_key, file)

    # 2. insert materials row
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO materials
            (id, user_id, title, filename, file_type, minio_key, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')""",
            material_id, str(user["id"]),
            file.filename.rsplit('.', 1)[0],
            file.filename,
            file.filename.rsplit('.', 1)[-1].lower(),
            minio_key
        )

    # 3. background ingestion (non-blocking)
    background_tasks.add_task(ingest_material, material_id, minio_key, pool)

    return {"id": str(material_id), "status": "pending"}

@router.get("/")
async def list_materials(
    user = Depends(get_current_user),
    pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, filename, status, created_at, concepts
            FROM materials
            WHERE user_id=$1
            ORDER BY created_at DESC
            """, str(user["id"])
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
