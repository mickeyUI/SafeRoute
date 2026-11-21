from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field

class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=120)
    relationship: Optional[str] = Field(default="Family / Friend", max_length=50)

class ContactRead(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    relationship: Optional[str] = "Family / Friend"
    created_at: datetime
