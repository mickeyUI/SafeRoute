"""ORM models. Importing this package registers every table on Base.metadata."""

from app.models.contact import Contact
from app.models.journey import Journey, JourneyStatus
from app.models.report import Report, ReportStatus, ReportType
from app.models.route import Route, TravelMode
from app.models.safe_location import SafeLocation, SafeLocationCategory
from app.models.user import User, UserRole

__all__ = [
    "Contact",
    "Journey",
    "JourneyStatus",
    "Report",
    "ReportStatus",
    "ReportType",
    "Route",
    "SafeLocation",
    "SafeLocationCategory",
    "TravelMode",
    "User",
    "UserRole",
]
