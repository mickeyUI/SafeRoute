from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import get_optional_current_user
from app.schemas.contact import ContactCreate, ContactRead
from app.services.data_store import data_store

router = APIRouter()


@router.post("", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate, current_user: dict[str, Any] | None = Depends(get_optional_current_user)
):
    """
    Add a trusted emergency contact (e.g. family member, roommate, security desk).
    """
    user_id = current_user.get("id") if current_user else "user_demo_123"
    created = data_store.create_contact(user_id=user_id, contact_in=payload)
    return created


@router.get("", response_model=list[ContactRead])
async def list_contacts(current_user: dict[str, Any] | None = Depends(get_optional_current_user)):
    """
    Retrieve all trusted contacts associated with the user.
    """
    user_id = current_user.get("id") if current_user else "user_demo_123"
    return data_store.list_contacts(user_id=user_id)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: str, current_user: dict[str, Any] | None = Depends(get_optional_current_user)
):
    """
    Remove a trusted contact.
    """
    user_id = current_user.get("id") if current_user else "user_demo_123"
    deleted = data_store.delete_contact(contact_id=contact_id, user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Contact not found")
    return None
