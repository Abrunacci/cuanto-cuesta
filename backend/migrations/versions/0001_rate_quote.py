"""rate_quote: the current quote of each rate, one row per rate.

Also lets the app's role (``APP_DB_USER``, when the app does not run as the owner) read and
write it, and every table later migrations create, so a new table never ships unreachable.

Revision ID: 0001
Revises:
Create Date: 2026-10-02
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRIVILEGES = "SELECT, INSERT, UPDATE"


def upgrade() -> None:
    op.create_table(
        "rate_quote",
        sa.Column("key", sa.Text, primary_key=True),
        sa.Column("price", sa.Numeric, nullable=False),
        sa.Column("estimated_final", sa.Numeric, nullable=True),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("source_url", sa.Text, nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("batch_id", sa.Uuid, nullable=False),
        sa.CheckConstraint("price > 0", name="rate_quote_price_positive"),
        sa.CheckConstraint("estimated_final > 0", name="rate_quote_estimated_final_positive"),
    )
    role = _app_role()
    if role is not None:
        op.execute(f"GRANT {PRIVILEGES} ON rate_quote TO {role}")
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT {PRIVILEGES} ON TABLES TO {role}"
        )


def downgrade() -> None:
    role = _app_role()
    if role is not None:
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE {PRIVILEGES} ON TABLES FROM {role}"
        )
    op.drop_table("rate_quote")


def _app_role() -> str | None:
    """The app's role, quoted as an identifier; None when the app runs as the owner."""
    name = os.environ.get("APP_DB_USER", "").strip()
    return op.get_bind().dialect.identifier_preparer.quote(name) if name else None
