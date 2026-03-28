# app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.db import close_pool, init_pool
from app.routers import auth, chat, lessons, materials, profile, quiz
from app.services.storage import ensure_bucket

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    ensure_bucket()
    yield
    await close_pool()

app = FastAPI(title="Guru API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(lessons.router)
app.include_router(materials.router)
app.include_router(profile.router)
app.include_router(quiz.router)