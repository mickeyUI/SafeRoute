"""Application settings loaded from environment variables / .env."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "SafeRoute"
    app_env: Literal["local", "test", "staging", "production"] = "local"
    debug: bool = True
    version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"

    secret_key: str = "dev-only-secret-change-me-32-bytes-long"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    database_url: str = (
        "postgresql+psycopg://saferoute:saferoute@localhost:5432/saferoute"
    )
    db_echo: bool = False

    # Comma-separated list, e.g. "http://localhost:3000,exp://localhost:8081".
    cors_origins: str = "http://localhost:3000,http://localhost:8081"
    rate_limit_per_minute: int = 30

    routing_provider: Literal["stub", "graphhopper", "osrm"] = "stub"
    routing_alternatives: int = 3
    routing_timeout_seconds: int = 5
    graphhopper_url: str = "https://graphhopper.com/api/1/route"
    graphhopper_api_key: str = ""
    osrm_url: str = "http://router.project-osrm.org"

    report_max_age_days: int = 90
    safe_location_radius_m: int = 150
    default_search_radius_m: int = 1000

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
    """Cached settings accessor; override with dependency injection in tests."""
    return Settings()


settings = get_settings()
