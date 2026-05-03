# app/worker.py

import arq
import asyncpg
import uuid

from app.config import settings
from app.services.ingestion import ingest_material

async def run_ingest(ctx, material_id: str, minio_key: str):
    """ARQ task - ingest material. Retried automatically on failure"""
    pool = ctx['pool']
    from app.services.ingestion import maybe_split_and_ingest
    await maybe_split_and_ingest(uuid.UUID(material_id), minio_key, pool)

async def startup(ctx):
    ctx['pool'] = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
        ssl=False,
    )

async def shutdown(ctx):
    await ctx['pool'].close()

class WorkerSettings:
    functions = [run_ingest]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 4
    job_timeout = 3600
    retry_jobs = True
    max_tries = 3