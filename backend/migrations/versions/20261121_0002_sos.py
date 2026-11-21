"""add sos alerts

Revision ID: 20261121_0002
Revises: 20261121_0001
Create Date: 2026-11-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision = "20261121_0002"
down_revision = "20261121_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sos_alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("location", Geometry("Point", srid=4326, spatial_index=False), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("voice_attached", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("picture_name", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "acknowledged", "cancelled", name="sos_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("responded_by", sa.Uuid(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
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
            ["reporter_id"],
            ["users.id"],
            name="fk_sos_alerts_reporter_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["responded_by"],
            ["users.id"],
            name="fk_sos_alerts_responded_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sos_alerts"),
    )
    op.create_index("ix_sos_alerts_reporter_id", "sos_alerts", ["reporter_id"], unique=False)
    op.create_index(
        "ix_sos_alerts_location_gist", "sos_alerts", ["location"], postgresql_using="gist"
    )


def downgrade() -> None:
    op.drop_index("ix_sos_alerts_location_gist", table_name="sos_alerts")
    op.drop_index("ix_sos_alerts_reporter_id", table_name="sos_alerts")
    op.drop_table("sos_alerts")
    op.execute("DROP TYPE IF EXISTS sos_status")
