"""Postgres: the ``rate_quote`` table and the ``QuoteStore`` that reads and writes it.

A held reading (a jump waiting for confirmation) lives in the ``held_*`` columns of its rate's
row, all null when there is none: there is still one row per rate and no history.

SQLAlchemy Core, no ORM: one table, read and written by a handful of statements. The schema
itself is created by the migrations (``backend/migrations``); this module only describes it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert

from cuanto_cuesta.domain import Held, Quote

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
    sa.Column("held_price", sa.Numeric(asdecimal=True), nullable=True),
    sa.Column("held_estimated_final", sa.Numeric(asdecimal=True), nullable=True),
    sa.Column("held_source", sa.Text, nullable=True),
    sa.Column("held_source_url", sa.Text, nullable=True),
    sa.Column("held_observed_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("held_confirmations", sa.Integer, nullable=True),
    sa.Column("held_last_seen", sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("price > 0", name="rate_quote_price_positive"),
    sa.CheckConstraint("estimated_final > 0", name="rate_quote_estimated_final_positive"),
    sa.CheckConstraint(
        "num_nulls(held_price, held_source, held_observed_at, held_confirmations,"
        " held_last_seen) IN (0, 5)",
        name="rate_quote_held_whole",
    ),
    sa.CheckConstraint("held_price > 0", name="rate_quote_held_price_positive"),
    sa.CheckConstraint("held_estimated_final > 0", name="rate_quote_held_estimated_final_positive"),
)

_NO_HELD = {
    "held_price": None,
    "held_estimated_final": None,
    "held_source": None,
    "held_source_url": None,
    "held_observed_at": None,
    "held_confirmations": None,
    "held_last_seen": None,
}

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

    def held(self, key: str) -> Held | None:
        row = self._connection.execute(
            sa.select(rate_quote).where(rate_quote.c.key == key)
        ).one_or_none()
        return None if row is None else _held(row)

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
        } | _NO_HELD
        statement = insert(rate_quote).values(values)
        self._connection.execute(
            statement.on_conflict_do_update(
                index_elements=[rate_quote.c.key],
                set_={name: statement.excluded[name] for name in values if name != "key"},
            )
        )

    def hold(self, key: str, held: Held) -> None:
        reading = held.quote
        self._connection.execute(
            sa.update(rate_quote)
            .where(rate_quote.c.key == key)
            .values(
                held_price=reading.price,
                held_estimated_final=reading.estimated_final,
                held_source=reading.source,
                held_source_url=reading.source_url,
                held_observed_at=reading.observed_at,
                held_confirmations=held.confirmations,
                held_last_seen=held.last_seen,
            )
        )

    def all(self) -> list[tuple[Quote, Held | None]]:
        rows = self._connection.execute(sa.select(rate_quote).order_by(rate_quote.c.key))
        return [(_quote(row), _held(row)) for row in rows]


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


def _held(row: sa.Row[tuple[object, ...]]) -> Held | None:
    data = row._mapping
    if data["held_price"] is None:
        return None
    return Held(
        quote=Quote(
            key=data["key"],
            price=data["held_price"],
            estimated_final=data["held_estimated_final"],
            source=data["held_source"],
            source_url=data["held_source_url"],
            observed_at=data["held_observed_at"],
        ),
        confirmations=data["held_confirmations"],
        last_seen=data["held_last_seen"],
    )
