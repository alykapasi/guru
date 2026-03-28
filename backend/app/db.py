# app/db.py

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None

async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
        ssl=False
    )

async def close_pool():
    global _pool
    if _pool:
        await _pool.close()

async def get_pool() -> asyncpg.Pool:
    return _pool

# usage in a router
# pool = await get_pool()
# async with pool.acquire() as conn:
#   rows = await conn.fetch('SELECT * FROM materials WHERE user_id=$1, uid)