import uuid
import math
import hashlib
from datetime import UTC, datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from app.schemas.report import ReportCategory, ModerationStatus, ReportCreate
from app.schemas.safe_location import SafeLocationCategory
from app.schemas.journey import JourneyStatus
from app.schemas.contact import ContactCreate
from app.schemas.sos import SosAlertCreate

class DataStore:
    """
    In-memory / persistent data store seeded with Addis Ababa, Ethiopia reference points.
    Synchronizes community reports, safe havens, trusted contacts, and journey states.
    """

    def __init__(self):
        self.reports: Dict[str, Dict[str, Any]] = {}
        self.safe_locations: Dict[str, Dict[str, Any]] = {}
        self.journeys: Dict[str, Dict[str, Any]] = {}
        self.shares: Dict[str, Dict[str, Any]] = {}
        self.contacts: Dict[str, Dict[str, Any]] = {}
        self.users: Dict[str, Dict[str, Any]] = {}
        self.sos_alerts: Dict[str, Dict[str, Any]] = {}
        self.seed_initial_data()

    @staticmethod
    def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371000.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = (math.sin(delta_phi / 2.0) ** 2 +
             math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return R * c

    @staticmethod
    def hash_password(password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    def seed_initial_data(self):
        now = datetime.now(timezone.utc)

        # 0. Seed Demo User
        demo_user_id = "user_demo_123"
        self.users["demo@saferoute.app"] = {
            "id": demo_user_id,
            "email": "demo@saferoute.app",
            "password_hash": self.hash_password("SafeRoute2026!"),
            "full_name": "Safe Traveler",
            "role": "user",
            "created_at": now
        }

        # Seed Trusted Contacts for Demo User
        self.create_contact(demo_user_id, ContactCreate(
            name="Sara (Sister / Roommate)",
            phone="+251 91 123 4567",
            email="sara@example.com",
            relationship="Family"
        ))
        self.create_contact(demo_user_id, ContactCreate(
            name="AAU Campus Security Office",
            phone="+251 11 123 4567",
            email="security@aau.edu.et",
            relationship="Campus Safety"
        ))

        # 1. Verified Safe Locations in Addis Ababa
        safe_places = [
            {
                "id": str(uuid.uuid4()),
                "name": "Addis Ababa Central Police Headquarters",
                "category": SafeLocationCategory.POLICE_STATION,
                "latitude": 9.0195,
                "longitude": 38.7525,
                "description": "24/7 Police station with public front desk and secure lighting.",
                "contact_phone": "+251 11 155 1200",
                "is_24_7": True,
                "verification_status": "verified"
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Arat Kilo Police Sub-Station",
                "category": SafeLocationCategory.POLICE_STATION,
                "latitude": 9.0335,
                "longitude": 38.7628,
                "description": "Stationed near AAU Campus, staffed round the clock.",
                "contact_phone": "+251 11 123 4567",
                "is_24_7": True,
                "verification_status": "verified"
            },
            {
                "id": str(uuid.uuid4()),
                "name": "St. Paul's Hospital Millennium Medical College",
                "category": SafeLocationCategory.HOSPITAL,
                "latitude": 9.0392,
                "longitude": 38.7308,
                "description": "24/7 Emergency department with continuous security personnel.",
                "contact_phone": "+251 11 275 0125",
                "is_24_7": True,
                "verification_status": "verified"
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Tikur Anbessa (Black Lion) Specialized Hospital",
                "category": SafeLocationCategory.HOSPITAL,
                "latitude": 9.0180,
                "longitude": 38.7480,
                "description": "Large medical center, brightly lit main entrance, 24/7 security.",
                "contact_phone": "+251 11 551 1211",
                "is_24_7": True,
                "verification_status": "verified"
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Piassa 24-Hour Community Pharmacy",
                "category": SafeLocationCategory.PHARMACY,
                "latitude": 9.0340,
                "longitude": 38.7510,
                "description": "Well-lit 24/7 community pharmacy on commercial street.",
                "contact_phone": "+251 11 111 8899",
                "is_24_7": True,
                "verification_status": "verified"
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Bole Medhanialem Community Security Hub",
                "category": SafeLocationCategory.VERIFIED_HAVEN,
                "latitude": 8.9980,
                "longitude": 38.7860,
                "description": "Registered commercial safety partner with security presence.",
                "contact_phone": "+251 11 662 0011",
                "is_24_7": True,
                "verification_status": "verified"
            }
        ]
        for sp in safe_places:
            self.safe_locations[sp["id"]] = sp

        # 2. Community Incident Reports in Addis Ababa
        community_reports = [
            {
                "id": str(uuid.uuid4()),
                "category": ReportCategory.POOR_LIGHTING,
                "latitude": 9.0270,
                "longitude": 38.7460,
                "severity": 4,
                "description": "Three consecutive street lamps broken. Pedestrians must walk in complete darkness.",
                "status": ModerationStatus.APPROVED,
                "is_anonymous": True,
                "created_at": now - timedelta(days=2),
            },
            {
                "id": str(uuid.uuid4()),
                "category": ReportCategory.HARASSMENT,
                "latitude": 9.0255,
                "longitude": 38.7475,
                "severity": 4,
                "description": "Group loitering near unlit corner regularly catcalling and intimidating female commuters.",
                "status": ModerationStatus.APPROVED,
                "is_anonymous": False,
                "created_at": now - timedelta(days=5),
            },
            {
                "id": str(uuid.uuid4()),
                "category": ReportCategory.ISOLATED_AREA,
                "latitude": 9.0315,
                "longitude": 38.7440,
                "severity": 3,
                "description": "Construction fence blocks sidewalk, forcing pedestrians into narrow blind spot.",
                "status": ModerationStatus.APPROVED,
                "is_anonymous": True,
                "created_at": now - timedelta(days=12),
            },
            {
                "id": str(uuid.uuid4()),
                "category": ReportCategory.UNSAFE_STOP,
                "latitude": 9.0140,
                "longitude": 38.7580,
                "severity": 3,
                "description": "Bus stop lacks shelter and lighting; gets very deserted after 8:00 PM.",
                "status": ModerationStatus.APPROVED,
                "is_anonymous": True,
                "created_at": now - timedelta(days=8),
            },
            {
                "id": str(uuid.uuid4()),
                "category": ReportCategory.SUSPICIOUS_ACTIVITY,
                "latitude": 9.0360,
                "longitude": 38.7580,
                "severity": 3,
                "description": "Multiple individuals following lone walkers towards campus gate.",
                "status": ModerationStatus.APPROVED,
                "is_anonymous": True,
                "created_at": now - timedelta(days=18),
            }
        ]
        for rep in community_reports:
            self.reports[rep["id"]] = rep

    # --- User Auth Methods ---
    def register_user(self, email: str, password: str, full_name: str = "") -> Dict[str, Any]:
        email_clean = email.lower().strip()
        if email_clean in self.users:
            return None
        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        record = {
            "id": user_id,
            "email": email_clean,
            "password_hash": self.hash_password(password),
            "full_name": full_name or email_clean.split("@")[0].title(),
            "role": "user",
            "created_at": datetime.now(timezone.utc)
        }
        self.users[email_clean] = record

        # Sync to PostgreSQL / Supabase if available
        try:
            from app.db.session import SessionLocal
            from app.models.user import User as UserModel, UserRole
            with SessionLocal() as session:
                db_user = session.query(UserModel).filter(UserModel.email == email_clean).first()
                if not db_user:
                    uid = uuid.UUID(user_id) if len(user_id) == 36 else uuid.uuid4()
                    db_user = UserModel(
                        id=uid,
                        email=email_clean,
                        hashed_password=self.hash_password(password),
                        full_name=record["full_name"],
                        role=UserRole.user,
                        is_active=True
                    )
                    session.add(db_user)
                    session.commit()
                    record["id"] = str(db_user.id)
                else:
                    record["id"] = str(db_user.id)
        except Exception:
            pass

        return record

    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        email_clean = email.lower().strip()
        user = self.users.get(email_clean)
        if not user or user["password_hash"] != self.hash_password(password):
            return None
        return user

    def get_or_create_google_user(self, email: str, full_name: str = "", avatar_url: Optional[str] = None) -> Dict[str, Any]:
        email_clean = email.lower().strip()
        user = self.users.get(email_clean)
        if user:
            if full_name and not user.get("full_name"):
                user["full_name"] = full_name
            if avatar_url and not user.get("avatar_url"):
                user["avatar_url"] = avatar_url
            return user

        user_id = f"usr_g_{uuid.uuid4().hex[:10]}"
        record = {
            "id": user_id,
            "email": email_clean,
            "password_hash": self.hash_password(f"google_oauth_{uuid.uuid4().hex}"),
            "full_name": full_name or email_clean.split("@")[0].title(),
            "role": "user",
            "provider": "google",
            "avatar_url": avatar_url,
            "created_at": datetime.now(timezone.utc)
        }
        self.users[email_clean] = record

        # Sync to PostgreSQL / Supabase if available
        try:
            from app.db.session import SessionLocal
            from app.models.user import User as UserModel, UserRole
            with SessionLocal() as session:
                db_user = session.query(UserModel).filter(UserModel.email == email_clean).first()
                if not db_user:
                    db_user = UserModel(
                        id=uuid.uuid4(),
                        email=email_clean,
                        hashed_password=record["password_hash"],
                        full_name=record["full_name"],
                        role=UserRole.user,
                        is_active=True
                    )
                    session.add(db_user)
                    session.commit()
                    record["id"] = str(db_user.id)
                else:
                    record["id"] = str(db_user.id)
        except Exception:
            pass

        return record

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        for u in self.users.values():
            if u["id"] == user_id:
                return u
        return None

    # --- Trusted Contacts Methods ---
    def create_contact(self, user_id: str, contact_in: ContactCreate) -> Dict[str, Any]:
        contact_id = f"cnt_{uuid.uuid4().hex[:10]}"
        record = {
            "id": contact_id,
            "user_id": user_id,
            "name": contact_in.name,
            "phone": contact_in.phone,
            "email": contact_in.email,
            "relationship": contact_in.relationship or "Family / Friend",
            "created_at": datetime.now(timezone.utc)
        }
        self.contacts[contact_id] = record

        # Sync to PostgreSQL / Supabase if available
        try:
            from app.db.session import SessionLocal
            from app.models.user import User as UserModel, UserRole
            from app.models.contact import Contact as ContactModel

            with SessionLocal() as session:
                try:
                    uid = uuid.UUID(user_id)
                except (ValueError, TypeError):
                    uid = uuid.uuid5(uuid.NAMESPACE_DNS, str(user_id))

                db_user = session.query(UserModel).filter(UserModel.id == uid).first()
                if not db_user:
                    db_user = UserModel(
                        id=uid,
                        email=f"{user_id}@saferoute.app",
                        hashed_password=self.hash_password("SafeRoute2026!"),
                        full_name="SafeRoute User",
                        role=UserRole.user,
                        is_active=True
                    )
                    session.add(db_user)
                    session.flush()

                cid = uuid.uuid4()
                db_contact = ContactModel(
                    id=cid,
                    user_id=uid,
                    name=contact_in.name,
                    phone=contact_in.phone,
                    email=contact_in.email,
                    relationship=contact_in.relationship or "Family / Friend",
                    is_primary=True
                )
                session.add(db_contact)
                session.commit()
                if str(cid) != contact_id:
                    self.contacts.pop(contact_id, None)
                    record["id"] = str(cid)
                    self.contacts[str(cid)] = record
        except Exception:
            pass

        return record

    def list_contacts(self, user_id: str) -> List[Dict[str, Any]]:
        return [c for c in self.contacts.values() if c["user_id"] == user_id]

    def delete_contact(self, contact_id: str, user_id: str) -> bool:
        c = self.contacts.get(contact_id)
        if not c or c["user_id"] != user_id:
            # Also check if it's in the DB
            try:
                from app.db.session import SessionLocal
                from app.models.contact import Contact as ContactModel
                with SessionLocal() as session:
                    cid = uuid.UUID(contact_id)
                    db_c = session.query(ContactModel).filter(ContactModel.id == cid).first()
                    if db_c:
                        session.delete(db_c)
                        session.commit()
                        self.contacts.pop(contact_id, None)
                        return True
            except Exception:
                pass
            return False
        del self.contacts[contact_id]
        try:
            from app.db.session import SessionLocal
            from app.models.contact import Contact as ContactModel
            with SessionLocal() as session:
                cid = uuid.UUID(contact_id)
                db_c = session.query(ContactModel).filter(ContactModel.id == cid).first()
                if db_c:
                    session.delete(db_c)
                    session.commit()
        except Exception:
            pass
        return True

    # --- SOS Alert Methods ---
    def create_sos_alert(
        self,
        alert_in: SosAlertCreate,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Store an active SOS broadcast so nearby SafeRoute clients can find it."""
        now = datetime.now(UTC)
        alert_id = f"sos_{uuid.uuid4().hex[:12]}"
        alert = {
            "id": alert_id,
            "user_id": user_id,
            "client_id": alert_in.client_id,
            "latitude": alert_in.latitude,
            "longitude": alert_in.longitude,
            "radius_meters": alert_in.radius_meters,
            "reason": alert_in.reason,
            "status": "active",
            "share_token": alert_in.share_token,
            "share_url": alert_in.share_url,
            "journey_id": alert_in.journey_id,
            "created_at": now,
            "expires_at": now + timedelta(hours=alert_in.valid_hours),
            "resolved_at": None,
        }
        self.sos_alerts[alert_id] = alert
        return alert

    def get_active_sos_alerts_nearby(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 25000.0,
    ) -> list[dict[str, Any]]:
        """Return live alerts whose broadcast area reaches the queried point."""
        now = datetime.now(UTC)
        results: list[dict[str, Any]] = []
        for alert in self.sos_alerts.values():
            if alert["status"] != "active" or alert["expires_at"] <= now:
                continue
            distance = self.haversine_distance(
                lat, lon, alert["latitude"], alert["longitude"]
            )
            # An alert is visible inside its own radius, and only to clients
            # searching within the requested radius.
            if distance <= min(alert["radius_meters"], radius_meters):
                copy_alert = dict(alert)
                copy_alert["distance_meters"] = distance
                results.append(copy_alert)
        results.sort(key=lambda item: item["distance_meters"])
        return results

    def resolve_sos_alert(
        self,
        alert_id: str,
        client_id: str | None = None,
        user_id: str | None = None,
    ) -> bool:
        """Let the originating device mark its own alert as resolved."""
        alert = self.sos_alerts.get(alert_id)
        if not alert or alert["status"] != "active":
            return False
        is_owner = (
            bool(client_id and alert.get("client_id") == client_id)
            or bool(user_id and alert.get("user_id") == user_id)
        )
        if not is_owner:
            return False
        alert["status"] = "resolved"
        alert["resolved_at"] = datetime.now(UTC)
        return True

    # --- Incident Report Methods ---
    def create_report(self, report_in: ReportCreate, user_id: Optional[str] = None) -> Dict[str, Any]:
        report_id = str(uuid.uuid4())
        item = {
            "id": report_id,
            "user_id": None if report_in.is_anonymous else user_id,
            "category": report_in.category,
            "latitude": report_in.latitude,
            "longitude": report_in.longitude,
            "severity": report_in.severity,
            "description": report_in.description,
            "status": ModerationStatus.APPROVED,
            "is_anonymous": report_in.is_anonymous,
            "created_at": datetime.now(timezone.utc),
            "reported_days_ago": 0
        }
        self.reports[report_id] = item
        return item

    def get_nearby_reports(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 3000.0,
        status: Optional[ModerationStatus] = ModerationStatus.APPROVED
    ) -> List[Dict[str, Any]]:
        results = []
        now = datetime.now(timezone.utc)
        for rep in self.reports.values():
            if status and rep["status"] != status:
                continue
            dist = self.haversine_distance(lat, lon, rep["latitude"], rep["longitude"])
            if dist <= radius_meters:
                copy_rep = dict(rep)
                age_days = (now - rep["created_at"]).days
                copy_rep["reported_days_ago"] = max(0, age_days)
                results.append(copy_rep)
        return results

    # --- Safe Locations Methods ---
    def get_nearby_safe_locations(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 5000.0
    ) -> List[Dict[str, Any]]:
        results = []
        for loc in self.safe_locations.values():
            dist = self.haversine_distance(lat, lon, loc["latitude"], loc["longitude"])
            if dist <= radius_meters:
                results.append(loc)
        return results

    # --- Journey Methods & State Machine ---
    def create_journey(
        self,
        user_id: str,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
        duration_seconds: int = 1800,
        route_coords: Optional[List[List[float]]] = None
    ) -> Dict[str, Any]:
        journey_id = f"jrn_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc)
        journey = {
            "id": journey_id,
            "user_id": user_id,
            "origin": {"latitude": origin_lat, "longitude": origin_lon},
            "destination": {"latitude": dest_lat, "longitude": dest_lon},
            "status": JourneyStatus.ACTIVE,
            "started_at": now,
            "estimated_arrival_at": now + timedelta(seconds=duration_seconds),
            "ended_at": None,
            "route_coordinates": route_coords or [],
            "checkins": []
        }
        self.journeys[journey_id] = journey
        return journey

    def get_journey(self, journey_id: str) -> Optional[Dict[str, Any]]:
        return self.journeys.get(journey_id)

    def add_checkin(self, journey_id: str, lat: float, lon: float, checkin_type: str, note: Optional[str]) -> Optional[Dict[str, Any]]:
        journey = self.journeys.get(journey_id)
        if not journey:
            return None
        now = datetime.now(timezone.utc)
        checkin = {
            "id": str(uuid.uuid4()),
            "latitude": lat,
            "longitude": lon,
            "checkin_type": checkin_type,
            "note": note,
            "created_at": now
        }
        journey["checkins"].append(checkin)
        if checkin_type == "arrival":
            journey["status"] = JourneyStatus.ARRIVED
            journey["ended_at"] = now
        return checkin

    def complete_journey(self, journey_id: str) -> Optional[Dict[str, Any]]:
        journey = self.journeys.get(journey_id)
        if not journey:
            return None
        journey["status"] = JourneyStatus.ARRIVED
        journey["ended_at"] = datetime.now(timezone.utc)
        return journey

    def cancel_journey(self, journey_id: str) -> Optional[Dict[str, Any]]:
        journey = self.journeys.get(journey_id)
        if not journey:
            return None
        journey["status"] = JourneyStatus.CANCELLED
        journey["ended_at"] = datetime.now(timezone.utc)
        return journey

    def end_journey(self, journey_id: str) -> Optional[Dict[str, Any]]:
        return self.complete_journey(journey_id)

    def create_share_token(self, journey_id: str, valid_hours: int = 2) -> Dict[str, Any]:
        raw_token = f"share_{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=valid_hours)
        share_record = {
            "token": raw_token,
            "journey_id": journey_id,
            "expires_at": expires_at,
            "is_revoked": False,
            "created_at": now
        }
        self.shares[raw_token] = share_record
        return share_record

    def get_share_by_token(self, raw_token: str) -> Optional[Dict[str, Any]]:
        return self.shares.get(raw_token)

    def create_safe_location(self, loc_data: Dict[str, Any]) -> Dict[str, Any]:
        loc_id = str(loc_data.get("id") or uuid.uuid4())
        coords = loc_data.get("location")
        lat = loc_data.get("latitude")
        lon = loc_data.get("longitude")
        if coords and isinstance(coords, (list, tuple)) and len(coords) == 2:
            lon, lat = float(coords[0]), float(coords[1])
        if lat is None:
            lat = 9.0300
        if lon is None:
            lon = 38.7400
        record = {
            "id": loc_id,
            "name": loc_data.get("name", "Safe Haven"),
            "category": loc_data.get("category", SafeLocationCategory.VERIFIED_HAVEN),
            "address": loc_data.get("address", ""),
            "latitude": float(lat),
            "longitude": float(lon),
            "description": loc_data.get("description") or loc_data.get("notes", ""),
            "contact_phone": loc_data.get("contact_phone", ""),
            "is_24_7": loc_data.get("is_24_7", True),
            "verification_status": "verified" if loc_data.get("is_verified") else "pending",
            "is_verified": bool(loc_data.get("is_verified", False)),
            "created_at": datetime.now(timezone.utc)
        }
        self.safe_locations[loc_id] = record
        return record

data_store = DataStore()
