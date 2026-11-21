from pydantic import BaseModel, Field


class SosAlertCreate(BaseModel):
    """Payload sent when a user confirms an emergency SOS."""

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_meters: float = Field(default=2000.0, ge=100.0, le=25000.0)
    reason: str | None = Field(default=None, max_length=500)
    client_id: str | None = Field(default=None, max_length=120)
    share_token: str | None = Field(default=None, max_length=200)
    share_url: str | None = Field(default=None, max_length=500)
    journey_id: str | None = Field(default=None, max_length=120)
    valid_hours: int = Field(default=3, ge=1, le=24)
