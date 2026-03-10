# app/db.py

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=2,
            max_size=10,
        )
    return _pool

# usage in a router
# pool = await get_pool()
# async with pool.acquire() as conn:
#   rows = await conn.fetch('SELECT * FROM materials WHERE user_id=$1, uid)