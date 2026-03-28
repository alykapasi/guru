# app/routers/auth.py

from fastapi import APIRouter, Depends, HTTPException
import uuid

from app.auth import hash_password, verify_password, create_token
from app.db import get_pool

router = APIRouter(prefix="/auth", tags=["auth"])

# app/routers/auth.py
@router.post("/register")
async def register(email: str, password: str, pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", email)
        if existing:
            raise HTTPException(400, "Email already registered")
        user_id = uuid.uuid4()
        await conn.execute(
            "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
            user_id, email, hash_password(password)
        )
    return {"token": create_token(user_id)}

@router.post("/login")
async def login(email: str, password: str, pool=Depends(get_pool)):
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email=$1", email)
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return {"token": create_token(user["id"])}