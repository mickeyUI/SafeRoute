import re
from functools import lru_cache
from typing import Literal
from urllib.parse import quote_plus

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App Identity
    app_name: str = "SafeRoute"
    PROJECT_NAME: str = "SafeRoute API"
    app_env: Literal["local", "test", "staging", "production"] = "local"
    debug: bool = True
    version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    API_V1_STR: str = "/api/v1"

    # Security & Auth
    secret_key: str = "dev-only-secret-change-me-32-bytes-long"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Supabase Auth Compatibility
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = "saferoute-local-fallback-secret-for-development"

    # Database
    database_url: str = "postgresql+psycopg://saferoute:saferoute@localhost:5432/saferoute"
    DATABASE_URL: str = "sqlite:///./saferoute_local.db"
    db_echo: bool = False

    # CORS & Rate Limiting
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:8081,*"
    )
    rate_limit_per_minute: int = 30
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*",
    ]

    # Routing Configuration (Strategy Pattern: "osrm", "graphhopper", "stub")
    routing_provider: Literal["stub", "graphhopper", "osrm"] = "osrm"
    routing_alternatives: int = 3
    routing_timeout_seconds: int = 5
    graphhopper_url: str = "https://graphhopper.com/api/1/route"
    graphhopper_api_key: str = ""
    osrm_url: str = "https://router.project-osrm.org"
    OSRM_BASE_URL: str = "https://router.project-osrm.org"
    ORS_API_KEY: str = ""

    # Safety Scoring & Search Radius
    report_max_age_days: int = 90
    safe_location_radius_m: int = 150
    default_search_radius_m: int = 1000

    # Target City Defaults (Addis Ababa, Ethiopia)
    DEFAULT_LATITUDE: float = 9.0300
    DEFAULT_LONGITUDE: float = 38.7400

    @field_validator("database_url", mode="before")
    @classmethod
    def _sanitize_database_url(cls, v: str) -> str:
        if not v or not isinstance(v, str):
            return v
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://") :]
        elif v.startswith("postgres://"):
            v = "postgresql+psycopg://" + v[len("postgres://") :]
        m = re.match(
            r"^(?P<scheme>[^:]+://)(?P<user>[^:]+):(?P<password>.+?)@(?P<host>[^/]+)/(?P<db>.*)$", v
        )
        if m:
            scheme = m.group("scheme")
            user = m.group("user")
            pw = m.group("password")
            host = m.group("host")
            db = m.group("db")
            if "%" not in pw:
                pw = quote_plus(pw)
            v = f"{scheme}{user}:{pw}@{host}/{db}"
        return v

    @field_validator("routing_alternatives")
    @classmethod
    def _validate_alternatives(cls, value: int) -> int:
        if not 1 <= value <= 5:
            raise ValueError("routing_alternatives must be between 1 and 5")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
