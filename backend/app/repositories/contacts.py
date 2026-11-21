"""Trusted contact persistence."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contact import Contact


def create(db: Session, contact: Contact) -> Contact:
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def list_for_user(db: Session, user_id: UUID) -> list[Contact]:
    stmt = (
        select(Contact)
        .where(Contact.user_id == user_id)
        .order_by(Contact.is_primary.desc(), Contact.created_at)
    )
    return list(db.scalars(stmt).all())


def get(db: Session, contact_id: UUID) -> Contact | None:
    return db.get(Contact, contact_id)


def delete(db: Session, contact: Contact) -> None:
    db.delete(contact)
    db.commit()
