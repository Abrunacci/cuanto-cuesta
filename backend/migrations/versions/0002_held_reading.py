"""rate_quote: room for a held reading, a jump kept aside until later readings confirm it.

Only adds nullable columns, so the previous release keeps working against the migrated schema
(it never reads them, and its upsert leaves them as they are).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("rate_quote", sa.Column("held_price", sa.Numeric, nullable=True))
    op.add_column("rate_quote", sa.Column("held_estimated_final", sa.Numeric, nullable=True))
    op.add_column("rate_quote", sa.Column("held_source", sa.Text, nullable=True))
    op.add_column("rate_quote", sa.Column("held_source_url", sa.Text, nullable=True))
    op.add_column(
        "rate_quote", sa.Column("held_observed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("rate_quote", sa.Column("held_confirmations", sa.Integer, nullable=True))
    op.add_column(
        "rate_quote", sa.Column("held_last_seen", sa.DateTime(timezone=True), nullable=True)
    )
    # A held reading is whole or absent: either every column has a value or none does, except
    # the two that may be null on any reading.
    op.create_check_constraint(
        "rate_quote_held_whole",
        "rate_quote",
        "num_nulls(held_price, held_source, held_observed_at, held_confirmations,"
        " held_last_seen) IN (0, 5)",
    )
    op.create_check_constraint("rate_quote_held_price_positive", "rate_quote", "held_price > 0")
    op.create_check_constraint(
        "rate_quote_held_estimated_final_positive", "rate_quote", "held_estimated_final > 0"
    )


def downgrade() -> None:
    for constraint in (
        "rate_quote_held_estimated_final_positive",
        "rate_quote_held_price_positive",
        "rate_quote_held_whole",
    ):
        op.drop_constraint(constraint, "rate_quote", type_="check")
    for column in (
        "held_last_seen",
        "held_confirmations",
        "held_observed_at",
        "held_source_url",
        "held_source",
        "held_estimated_final",
        "held_price",
    ):
        op.drop_column("rate_quote", column)
