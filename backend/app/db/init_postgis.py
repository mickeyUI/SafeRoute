"""Ensure the PostGIS extension exists. Run with `make db-init`."""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


def ensure_postgis() -> str:
    """Return the installed PostGIS version, creating the extension if needed."""
    with SessionLocal() as session:
        version = session.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
        ).scalar()
        if version is None:
            session.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            session.commit()
            version = session.execute(
                text("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
            ).scalar()
        logger.info("PostGIS version: %s", version)
        return str(version)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_postgis()
