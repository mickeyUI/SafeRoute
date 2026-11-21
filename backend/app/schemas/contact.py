from datetime import datetime

from pydantic import BaseModel, Field


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=120)
    relationship: str | None = Field(default="Family / Friend", max_length=50)


class ContactRead(BaseModel):
    id: str
    name: str
    phone: str | None = None
    email: str | None = None
    relationship: str | None = "Family / Friend"
    created_at: datetime
