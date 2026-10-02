"""Postgres: the ``rate_quote`` table and the ``QuoteStore`` that reads and writes it.

SQLAlchemy Core, no ORM: one table, read and written by a handful of statements. The schema
itself is created by the migrations (``backend/migrations``); this module only describes it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert

from cuanto_cuesta.domain import Quote

metadata = sa.MetaData()

rate_quote = sa.Table(
    "rate_quote",
    metadata,
    sa.Column("key", sa.Text, primary_key=True),
    # Unconstrained numeric keeps the decimals as they were sent: "1452.30" reads back as such.
    sa.Column("price", sa.Numeric(asdecimal=True), nullable=False),
    sa.Column("estimated_final", sa.Numeric(asdecimal=True), nullable=True),
    sa.Column("source", sa.Text, nullable=False),
    sa.Column("source_url", sa.Text, nullable=True),
    sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("batch_id", sa.Uuid, nullable=False),
    sa.CheckConstraint("price > 0", name="rate_quote_price_positive"),
    sa.CheckConstraint("estimated_final > 0", name="rate_quote_estimated_final_positive"),
)

_INGEST_LOCK = 0x6375616E746F
"""Any fixed number works: it only has to be the same for every ingest ("cuanto" in hex)."""


def create_engine(url: str) -> sa.Engine:
    # pre_ping: a connection the server closed (a restart, an idle timeout) is replaced
    # instead of failing the next request.
    return sa.create_engine(url, pool_pre_ping=True)


class SqlQuoteStore:
    """A ``QuoteStore`` over one connection; the caller owns its transaction."""

    def __init__(self, connection: sa.Connection) -> None:
        self._connection = connection

    def lock_for_ingest(self) -> None:
        # A transaction-level advisory lock, released at commit or rollback. Row locks would
        # not cover a key that has no row yet; ingests are rare and small, so one lock is enough.
        self._connection.execute(sa.select(sa.func.pg_advisory_xact_lock(_INGEST_LOCK)))

    def current(self, key: str) -> Quote | None:
        row = self._connection.execute(
            sa.select(rate_quote).where(rate_quote.c.key == key)
        ).one_or_none()
        return None if row is None else _quote(row)

    def save(self, quote: Quote, *, batch_id: UUID, received_at: datetime) -> None:
        values = {
            "key": quote.key,
            "price": quote.price,
            "estimated_final": quote.estimated_final,
            "source": quote.source,
            "source_url": quote.source_url,
            "observed_at": quote.observed_at,
            "received_at": received_at,
            "batch_id": batch_id,
        }
        statement = insert(rate_quote).values(values)
        self._connection.execute(
            statement.on_conflict_do_update(
                index_elements=[rate_quote.c.key],
                set_={name: statement.excluded[name] for name in values if name != "key"},
            )
        )

    def all(self) -> list[Quote]:
        rows = self._connection.execute(sa.select(rate_quote).order_by(rate_quote.c.key))
        return [_quote(row) for row in rows]


def _quote(row: sa.Row[tuple[object, ...]]) -> Quote:
    data = row._mapping
    return Quote(
        key=data["key"],
        price=data["price"],
        estimated_final=data["estimated_final"],
        source=data["source"],
        source_url=data["source_url"],
        observed_at=data["observed_at"],
    )
