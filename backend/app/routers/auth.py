# app/routers/auth.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import hash_password, verify_password, create_token
from app.db import get_pool
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

class AuthRequest(BaseModel):
    email: str
    password: str

@router.post("/register")
async def register(req: AuthRequest, pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", req.email)
        if existing:
            raise HTTPException(400, "Email already registered")
        user_id = uuid.uuid4()
        await conn.execute(
            "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
            user_id, req.email, hash_password(req.password)
        )
    return {"token": create_token(user_id), "is_new": True}

@router.post("/login")
async def login(req: AuthRequest, pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email=$1", req.email)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return {"token": create_token(str(user["id"]))}