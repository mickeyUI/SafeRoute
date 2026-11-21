"""Trusted contact endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models.contact import Contact
from app.models.user import User
from app.repositories import contacts as contact_repo
from app.schemas.journey import ContactCreate, ContactRead
from app.services.auth_service import get_current_active_user

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.post("", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
def create_contact(
    payload: ContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Contact:
    contact = Contact(user_id=current_user.id, **payload.model_dump())
    return contact_repo.create(db, contact)


@router.get("", response_model=list[ContactRead])
def list_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[Contact]:
    return contact_repo.list_for_user(db, current_user.id)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    contact = contact_repo.get(db, contact_id)
    if contact is None:
        raise NotFoundError("Contact not found")
    if contact.user_id != current_user.id:
        raise ForbiddenError("This contact belongs to another user")
    contact_repo.delete(db, contact)
