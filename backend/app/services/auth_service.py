"""Account registration, login, and FastAPI auth dependencies."""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AuthenticationError, ConflictError, ForbiddenError
from app.core.security import decode_access_token, hash_password, oauth2_scheme, verify_password
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest


def register_user(db: Session, payload: RegisterRequest) -> User:
    email = str(payload.email).lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise ConflictError("An account with this email already exists")

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.user,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, payload: LoginRequest) -> User:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")
    if not user.is_active:
        raise ForbiddenError("Account is inactive")
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    subject = payload.get("sub")
    if not subject:
        raise AuthenticationError("Access token is missing a subject")
    try:
        user = db.get(User, UUID(subject))
    except ValueError as exc:
        raise AuthenticationError("Invalid access token subject") from exc
    if user is None or not user.is_active:
        raise AuthenticationError("User not found or inactive")
    return user


optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.api_v1_prefix}/auth/login",
    auto_error=False,
)


def get_optional_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Attach the user when a token is present; anonymous requests still work."""
    if not token:
        return None
    return get_current_user(token=token, db=db)


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise ForbiddenError("Account is inactive")
    return current_user


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in {UserRole.moderator, UserRole.admin}:
        raise ForbiddenError("Moderator role required")
    return current_user
