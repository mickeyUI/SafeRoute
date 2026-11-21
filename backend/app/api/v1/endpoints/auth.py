from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import jwt
from app.core.config import settings
from app.core.security import get_current_user
from app.services.data_store import data_store

router = APIRouter()

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = ""

class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)

def create_access_token(user_id: str, email: str, role: str = "user") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=7)).timestamp())
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    """
    Register a new user account with email and password.
    """
    user = data_store.register_user(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name or ""
    )
    if not user:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    
    token = create_access_token(user["id"], user["email"], user["role"])
    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        },
        "access_token": token,
        "token_type": "bearer"
    }

@router.post("/login")
async def login(payload: LoginRequest):
    """
    Authenticate user and return JWT access token.
    """
    user = data_store.authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    token = create_access_token(user["id"], user["email"], user["role"])
    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        },
        "access_token": token,
        "token_type": "bearer"
    }

@router.get("/me")
async def get_my_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns authenticated user profile.
    """
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "username": current_user.get("username", "SafeTraveler"),
        "role": "user"
    }
