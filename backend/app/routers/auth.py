# app/routers/auth.py

from fastapi import APIRouter, Depends

from app.auth import hash_password, verify_password, create_token
from app.db import get_pool

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
async def register(email: str, password: str, pool=Depends(get_pool)):
    ...

@router.post("/login")
async def login(email: str, password: str, pool=Depends(get_pool)):
    ...