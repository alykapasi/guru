# app/main.py

from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.db import close_pool, init_pool
from app.routers import auth, chat, flashcards, lessons, materials, profile, stats, quiz
from app.services.storage import ensure_bucket

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    ensure_bucket()
    yield
    await close_pool()

app = FastAPI(title="Guru API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        os.getenv("FRONTEND_URL", "")
        ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(flashcards.router)
app.include_router(lessons.router)
app.include_router(materials.router)
app.include_router(profile.router)
app.include_router(stats.router)
app.include_router(quiz.router)