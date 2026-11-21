"""initial schema

Revision ID: 20261121_0001
Revises:
Create Date: 2026-11-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision = "20261121_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=True),
        sa.Column(
            "role",
            sa.Enum("user", "moderator", "admin", name="user_role"),
            nullable=False,
            server_default="user",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_unique_constraint("uq_users_email", "users", ["email"])

    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "harassment",
                "assault",
                "suspicious",
                "unsafe_lighting",
                "other",
                name="report_type",
            ),
            nullable=False,
        ),
        sa.Column("severity", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", Geometry("Point", srid=4326, spatial_index=False), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="report_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("severity BETWEEN 1 AND 5", name="reports_severity_range"),
        sa.ForeignKeyConstraint(
            ["reporter_id"],
            ["users.id"],
            name="fk_reports_reporter_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"],
            ["users.id"],
            name="fk_reports_reviewed_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_reports"),
    )
    op.create_index("ix_reports_reporter_id", "reports", ["reporter_id"], unique=False)
    op.create_index(
        "ix_reports_location_gist", "reports", ["location"], postgresql_using="gist"
    )

    op.create_table(
        "safe_locations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "police",
                "hospital",
                "transit",
                "shop",
                "friend",
                "other",
                name="safe_location_category",
            ),
            nullable=False,
        ),
        sa.Column("address", sa.String(length=240), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("location", Geometry("Point", srid=4326, spatial_index=False), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_safe_locations"),
    )
    op.create_index(
        "ix_safe_locations_location_gist",
        "safe_locations",
        ["location"],
        postgresql_using="gist",
    )

    op.create_table(
        "contacts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("relationship", sa.String(length=60), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_contacts_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_contacts"),
    )
    op.create_index("ix_contacts_user_id", "contacts", ["user_id"], unique=False)

    op.create_table(
        "routes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column(
            "travel_mode",
            sa.Enum("walk", "bike", "drive", name="travel_mode"),
            nullable=False,
        ),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("distance_m", sa.Integer(), nullable=False),
        sa.Column("duration_s", sa.Integer(), nullable=False),
        sa.Column("safety_score", sa.Float(), nullable=False),
        sa.Column("safety_confidence", sa.Float(), nullable=False),
        sa.Column("safety_factors", sa.JSON(), nullable=False),
        sa.Column("geometry", Geometry("LineString", srid=4326, spatial_index=False), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_routes_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_routes"),
    )
    op.create_index("ix_routes_request_id", "routes", ["request_id"], unique=False)
    op.create_index(
        "ix_routes_geometry_gist", "routes", ["geometry"], postgresql_using="gist"
    )

    op.create_table(
        "journeys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("route_id", sa.Uuid(), nullable=True),
        sa.Column("contact_id", sa.Uuid(), nullable=True),
        sa.Column("origin", Geometry("Point", srid=4326, spatial_index=False), nullable=False),
        sa.Column("destination", Geometry("Point", srid=4326, spatial_index=False), nullable=False),
        sa.Column("travel_mode", sa.String(length=16), nullable=False, server_default="walk"),
        sa.Column(
            "status",
            sa.Enum(
                "planned",
                "active",
                "completed",
                "cancelled",
                name="journey_status",
            ),
            nullable=False,
            server_default="planned",
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["contact_id"],
            ["contacts.id"],
            name="fk_journeys_contact_id_contacts",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["route_id"],
            ["routes.id"],
            name="fk_journeys_route_id_routes",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_journeys_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_journeys"),
    )
    op.create_index("ix_journeys_user_id", "journeys", ["user_id"], unique=False)
    op.create_index(
        "ix_journeys_origin_gist", "journeys", ["origin"], postgresql_using="gist"
    )
    op.create_index(
        "ix_journeys_destination_gist",
        "journeys",
        ["destination"],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("ix_journeys_destination_gist", table_name="journeys")
    op.drop_index("ix_journeys_origin_gist", table_name="journeys")
    op.drop_index("ix_journeys_user_id", table_name="journeys")
    op.drop_table("journeys")

    op.drop_index("ix_routes_geometry_gist", table_name="routes")
    op.drop_index("ix_routes_request_id", table_name="routes")
    op.drop_table("routes")

    op.drop_index("ix_contacts_user_id", table_name="contacts")
    op.drop_table("contacts")

    op.drop_index("ix_safe_locations_location_gist", table_name="safe_locations")
    op.drop_table("safe_locations")

    op.drop_index("ix_reports_location_gist", table_name="reports")
    op.drop_index("ix_reports_reporter_id", table_name="reports")
    op.drop_table("reports")

    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    for enum_name in (
        "journey_status",
        "travel_mode",
        "safe_location_category",
        "report_status",
        "report_type",
        "user_role",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
