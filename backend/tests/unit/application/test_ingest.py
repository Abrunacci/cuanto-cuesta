"""The ingest rules, against an in-memory store. The same rules run against Postgres in
``tests/integration``."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from cuanto_cuesta.application import (
    ItemResult,
    Malformed,
    RateCatalog,
    RateSpec,
    Rejection,
    Status,
    Submission,
    current_quotes,
    ingest,
)
from cuanto_cuesta.domain import Currency, Quote

NOW = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)
BATCH = UUID("0b8e6a3c-5d1f-4c1e-9a77-2f0c8f3e1b20")

CATALOG = RateCatalog(
    (
        RateSpec("mep", Currency.USD, Currency.ARS, Decimal(500), Decimal(50_000), False),
        RateSpec("card", Currency.USD, Currency.USDT, Decimal("0.5"), Decimal(2), True),
    )
)

MEP = Submission(
    key="mep",
    base="USD",
    quote="ARS",
    price="1540.50",
    estimated_final=None,
    sent_estimated_final=False,
    source="byma",
    source_url="https://example.com/mep",
    observed_at=NOW,
)
CARD = replace(
    MEP,
    key="card",
    base="USD",
    quote="USDT",
    price="0.9850",
    estimated_final="0.9712",
    sent_estimated_final=True,
)


class MemoryStore:
    def __init__(self) -> None:
        self.quotes: dict[str, Quote] = {}
        self.locked = False
        self.saved: list[tuple[Quote, UUID, datetime]] = []

    def lock_for_ingest(self) -> None:
        self.locked = True

    def current(self, key: str) -> Quote | None:
        return self.quotes.get(key)

    def save(self, quote: Quote, *, batch_id: UUID, received_at: datetime) -> None:
        self.quotes[quote.key] = quote
        self.saved.append((quote, batch_id, received_at))

    def all(self) -> list[Quote]:
        return sorted(self.quotes.values(), key=lambda q: q.key)


def run(store: MemoryStore, *items: Submission | Malformed) -> list[ItemResult]:
    return ingest(CATALOG, store, BATCH, items, NOW)


def one(item: Submission | Malformed, store: MemoryStore | None = None) -> ItemResult:
    [result] = run(store or MemoryStore(), item)
    return result


class TestStoring:
    def test_stores_a_first_quote(self) -> None:
        store = MemoryStore()
        assert run(store, MEP) == [ItemResult(0, "mep", Status.STORED)]
        assert store.locked
        [(quote, batch, received)] = store.saved
        assert quote == Quote("mep", Decimal("1540.50"), None, "byma", MEP.source_url, NOW)
        assert (batch, received) == (BATCH, NOW)

    def test_stores_the_card_estimate(self) -> None:
        store = MemoryStore()
        run(store, CARD)
        assert store.quotes["card"].estimated_final == Decimal("0.9712")

    def test_the_card_estimate_may_be_null(self) -> None:
        store = MemoryStore()
        assert one(replace(CARD, estimated_final=None), store).status is Status.STORED
        assert store.quotes["card"].estimated_final is None

    def test_a_newer_quote_replaces_the_current_one(self) -> None:
        store = MemoryStore()
        later = replace(MEP, price="1550", observed_at=NOW - timedelta(minutes=1))
        run(store, replace(MEP, observed_at=NOW - timedelta(minutes=2)), later)
        assert store.quotes["mep"].price == Decimal(1550)

    def test_an_older_quote_is_ignored(self) -> None:
        store = MemoryStore()
        older = replace(MEP, price="1500", observed_at=NOW - timedelta(minutes=1))
        assert run(store, MEP, older)[1] == ItemResult(1, "mep", Status.OLDER)
        assert store.quotes["mep"].price == Decimal("1540.50")

    def test_the_same_quote_again_is_unchanged(self) -> None:
        store = MemoryStore()
        again = replace(MEP, price="1540.5", source="other")
        assert run(store, MEP, again)[1] == ItemResult(1, "mep", Status.UNCHANGED)
        assert len(store.saved) == 1

    def test_the_same_time_with_another_value_is_a_conflict(self) -> None:
        store = MemoryStore()
        other = replace(MEP, price="1541")
        assert run(store, MEP, other)[1] == ItemResult(
            1, "mep", Status.REJECTED, Rejection.CONFLICT
        )
        assert store.quotes["mep"].price == Decimal("1540.50")

    def test_an_invalid_item_does_not_stop_the_others(self) -> None:
        store = MemoryStore()
        results = run(store, Malformed("mep"), replace(MEP, key="nope"), CARD)
        assert [r.status for r in results] == [Status.REJECTED, Status.REJECTED, Status.STORED]
        assert list(store.quotes) == ["card"]


class TestRejections:
    def test_a_malformed_item(self) -> None:
        assert one(Malformed(None)) == ItemResult(0, None, Status.REJECTED, Rejection.INVALID_ITEM)

    def test_an_unknown_key(self) -> None:
        assert one(replace(MEP, key="blue")).error is Rejection.UNKNOWN_KEY

    @pytest.mark.parametrize(("base", "quote"), [("ARS", "USD"), ("USD", "USDT"), ("usd", "ars")])
    def test_another_currency_pair(self, base: str, quote: str) -> None:
        assert one(replace(MEP, base=base, quote=quote)).error is Rejection.CURRENCY_MISMATCH

    def test_an_estimate_on_a_rate_without_one(self) -> None:
        sent = replace(MEP, estimated_final=None, sent_estimated_final=True)
        assert one(sent).error is Rejection.UNEXPECTED_FIELD

    def test_the_card_without_its_estimate_field(self) -> None:
        missing = replace(CARD, estimated_final=None, sent_estimated_final=False)
        assert one(missing).error is Rejection.INVALID_ITEM

    @pytest.mark.parametrize(
        "price",
        [
            "",
            "0",
            "0.000",
            "-1540",
            "+1540",
            "1,540.50",
            "1540.",
            ".5",
            "1e3",
            "NaN",
            " 1540",
            "1540.12345678901",
        ],
    )
    def test_a_price_that_is_not_a_plain_positive_decimal(self, price: str) -> None:
        assert one(replace(MEP, price=price)).error is Rejection.INVALID_PRICE

    def test_ten_decimal_places_are_accepted(self) -> None:
        assert one(replace(MEP, price="1540.1234567890")).status is Status.STORED

    def test_an_estimate_that_is_not_a_plain_decimal(self) -> None:
        assert one(replace(CARD, estimated_final="0,97")).error is Rejection.INVALID_PRICE

    @pytest.mark.parametrize("price", ["499.99", "50000.01", "1.54"])
    def test_a_price_out_of_range(self, price: str) -> None:
        assert one(replace(MEP, price=price)).error is Rejection.OUT_OF_RANGE

    def test_the_range_bounds_are_accepted(self) -> None:
        store = MemoryStore()
        low = replace(MEP, price="500", observed_at=NOW - timedelta(minutes=1))
        assert [r.status for r in run(store, low, replace(MEP, price="50000"))] == [
            Status.STORED,
            Status.STORED,
        ]

    def test_an_estimate_out_of_range(self) -> None:
        assert one(replace(CARD, estimated_final="2.01")).error is Rejection.OUT_OF_RANGE

    def test_more_than_five_minutes_in_the_future(self) -> None:
        ahead = replace(MEP, observed_at=NOW + timedelta(minutes=5, seconds=1))
        assert one(ahead).error is Rejection.FUTURE_OBSERVED_AT

    def test_up_to_five_minutes_in_the_future_is_clock_skew(self) -> None:
        assert one(replace(MEP, observed_at=NOW + timedelta(minutes=5))).status is Status.STORED

    def test_the_first_failing_check_names_the_error(self) -> None:
        wrong = replace(MEP, base="ARS", price="abc", observed_at=NOW + timedelta(days=1))
        assert one(wrong).error is Rejection.CURRENCY_MISMATCH


def test_current_quotes_follow_the_catalog_order() -> None:
    store = MemoryStore()
    run(store, CARD, MEP)
    assert [spec.key for spec, _ in current_quotes(CATALOG, store)] == ["mep", "card"]


def test_current_quotes_leave_out_rates_without_one() -> None:
    store = MemoryStore()
    run(store, CARD)
    assert [spec.key for spec, _ in current_quotes(CATALOG, store)] == ["card"]
