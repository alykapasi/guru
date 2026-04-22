# app/queue.py

from arq import create_pool as arq_create_pool
from arq.connections import RedisSettings
from app.config import settings

_redis = None

async def get_queue():
    global _redis
    if _redis is None:
        _redis = await arq_create_pool(
            RedisSettings.from_dsn(settings.redis_url)
        )
    return _redis