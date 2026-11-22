"""persistent anonymous reports

Revision ID: 20261122_0003
Revises: 20261121_0002
Create Date: 2026-11-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261122_0003"
down_revision = "20261121_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Anonymous reports have no authenticated reporter.
    op.alter_column(
        "reports",
        "reporter_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )

    # Keep the full API category on each row. The legacy `type` enum remains for
    # compatibility with the scoring engine, but it cannot represent categories
    # such as hazard, theft, or accident.
    op.add_column("reports", sa.Column("category", sa.Text(), nullable=True))
    op.create_index("ix_reports_category", "reports", ["category"], unique=False)
    op.execute(
        """
        UPDATE reports
        SET category = CASE type::text
            WHEN 'harassment' THEN 'harassment'
            WHEN 'suspicious' THEN 'suspicious_activity'
            WHEN 'unsafe_lighting' THEN 'poor_street_lighting'
            ELSE 'other'
        END
        WHERE category IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_reports_category", table_name="reports")
    op.drop_column("reports", "category")
    op.alter_column(
        "reports",
        "reporter_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
