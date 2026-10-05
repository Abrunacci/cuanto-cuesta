"""The ingest rules, against an in-memory store. The same rules run against Postgres in
``tests/integration``."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from cuanto_cuesta.application import (
    CONFIRMATIONS,
    ItemResult,
    Jump,
    JumpEvent,
    Malformed,
    RateCatalog,
    RateSpec,
    Rejection,
    Status,
    Submission,
    current_quotes,
    ingest,
)
from cuanto_cuesta.domain import Currency, Held, Percentage, Quote

NOW = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)
BATCH = UUID("0b8e6a3c-5d1f-4c1e-9a77-2f0c8f3e1b20")
TEN_PERCENT = Percentage(Decimal(10))

CATALOG = RateCatalog(
    (
        RateSpec(
            "mep", Currency.USD, Currency.ARS, Decimal(500), Decimal(50_000), False, TEN_PERCENT
        ),
        RateSpec(
            "card", Currency.USD, Currency.USDT, Decimal("0.5"), Decimal(2), True, TEN_PERCENT
        ),
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
        self.held_readings: dict[str, Held] = {}
        self.locked = False
        self.saved: list[tuple[Quote, UUID, datetime]] = []

    def lock_for_ingest(self) -> None:
        self.locked = True

    def current(self, key: str) -> Quote | None:
        return self.quotes.get(key)

    def held(self, key: str) -> Held | None:
        return self.held_readings.get(key)

    def save(self, quote: Quote, *, batch_id: UUID, received_at: datetime) -> None:
        self.quotes[quote.key] = quote
        self.held_readings.pop(quote.key, None)
        self.saved.append((quote, batch_id, received_at))

    def hold(self, key: str, held: Held) -> None:
        assert key in self.quotes
        self.held_readings[key] = held

    def all(self) -> list[tuple[Quote, Held | None]]:
        return [
            (q, self.held_readings.get(q.key))
            for q in sorted(self.quotes.values(), key=lambda q: q.key)
        ]


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
        # Each into its own store: from one to the other is a jump.
        assert one(replace(MEP, price="500")).status is Status.STORED
        assert one(replace(MEP, price="50000")).status is Status.STORED

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


def reading(minutes: int, price: str, item: Submission = MEP, **estimate: str | None) -> Submission:
    """``item`` observed ``minutes`` after the first one, with another price (and estimate)."""
    observed_at = NOW - timedelta(hours=1) + timedelta(minutes=minutes)
    changed = replace(item, price=price, observed_at=observed_at)
    if "estimated_final" in estimate:
        changed = replace(changed, estimated_final=estimate["estimated_final"])
    return changed


def held_quote(store: MemoryStore) -> Quote:
    return store.held_readings["mep"].quote


class TestJumps:
    """MEP and the card may move 10 % between readings (``CATALOG``)."""

    def stored(self, *items: Submission) -> MemoryStore:
        store = MemoryStore()
        run(store, reading(0, "1000"), *items)
        return store

    def test_up_to_the_limit_is_stored(self) -> None:
        store = self.stored(reading(1, "1100"), reading(2, "990"))
        assert store.quotes["mep"].price == Decimal(990)
        assert store.held_readings == {}

    @pytest.mark.parametrize("price", ["1100.01", "899.99", "10000"])
    def test_more_than_the_limit_is_held_and_answered_as_rejected(self, price: str) -> None:
        store = self.stored()
        [result] = run(store, reading(1, price))
        assert result == ItemResult(
            0,
            "mep",
            Status.REJECTED,
            Rejection.JUMP,
            Jump(JumpEvent.HELD, store.quotes["mep"], held_quote(store), held_quote(store)),
        )
        assert store.quotes["mep"].price == Decimal(1000)
        held = store.held_readings["mep"]
        assert (held.quote.price, held.confirmations) == (Decimal(price), 0)

    def test_the_jump_enters_when_the_next_readings_agree(self) -> None:
        store = self.stored(reading(1, "1500"), reading(2, "1520"))
        assert store.held_readings["mep"].confirmations == 1
        assert store.quotes["mep"].price == Decimal(1000)

        current, jump = store.quotes["mep"], held_quote(store)
        [result] = run(store, reading(3, "1490"))
        assert result == ItemResult(
            0,
            "mep",
            Status.STORED,
            jump=Jump(JumpEvent.CONFIRMED, current, jump, store.quotes["mep"], 2),
        )
        assert jump.price == Decimal(1500)
        assert CONFIRMATIONS == 2
        assert store.quotes["mep"].price == Decimal(1490)
        assert store.held_readings == {}

    def test_confirmations_are_measured_against_the_jump_not_a_drift(self) -> None:
        # 1500 -> 1640 is within 10 %, 1500 -> 1660 is not: a creeping source starts over.
        store = self.stored(reading(1, "1500"), reading(2, "1640"), reading(3, "1660"))
        held = store.held_readings["mep"]
        assert (held.quote.price, held.confirmations) == (Decimal(1660), 0)
        assert store.quotes["mep"].price == Decimal(1000)

    def test_a_reading_back_near_the_current_one_discards_the_jump(self) -> None:
        store = self.stored(reading(1, "1500"))
        current, jump = store.quotes["mep"], held_quote(store)
        [result] = run(store, reading(2, "1010"))
        assert result.status is Status.STORED
        assert result.jump == Jump(JumpEvent.DISCARDED, current, jump, store.quotes["mep"])
        assert store.quotes["mep"].price == Decimal(1010)
        assert store.held_readings == {}

    def test_a_reading_sent_again_counts_once(self) -> None:
        jump = reading(2, "1510")
        store = self.stored(reading(1, "1500"), jump)
        [again] = run(store, jump)
        assert again == ItemResult(0, "mep", Status.REJECTED, Rejection.JUMP)
        assert store.held_readings["mep"].confirmations == 1

    def test_older_and_repeated_readings_are_judged_as_before(self) -> None:
        store = self.stored()
        assert one(reading(-1, "5000"), store).status is Status.OLDER
        assert one(reading(0, "1000"), store).status is Status.UNCHANGED
        assert store.held_readings == {}

    def test_a_first_quote_has_nothing_to_jump_from(self) -> None:
        store = MemoryStore()
        assert one(reading(0, "40000"), store).status is Status.STORED

    def test_the_card_estimate_can_jump_on_its_own(self) -> None:
        card = reading(0, "0.98", CARD, estimated_final="0.97")
        store = MemoryStore()
        run(store, card)
        [result] = run(store, reading(1, "0.98", CARD, estimated_final="0.80"))
        assert result.error is Rejection.JUMP
        assert store.held_readings["card"].quote.estimated_final == Decimal("0.80")

    def test_a_missing_card_estimate_is_not_a_jump(self) -> None:
        store = MemoryStore()
        run(store, reading(0, "0.98", CARD, estimated_final="0.97"))
        assert one(reading(1, "0.98", CARD, estimated_final=None), store).status is Status.STORED


def test_current_quotes_follow_the_catalog_order() -> None:
    store = MemoryStore()
    run(store, CARD, MEP)
    assert [spec.key for spec, _, _ in current_quotes(CATALOG, store)] == ["mep", "card"]


def test_current_quotes_leave_out_rates_without_one() -> None:
    store = MemoryStore()
    run(store, CARD)
    assert [spec.key for spec, _, _ in current_quotes(CATALOG, store)] == ["card"]


def test_current_quotes_carry_the_held_reading() -> None:
    store = MemoryStore()
    run(store, reading(0, "1000"), reading(1, "2000"))
    [(_, quote, held)] = current_quotes(CATALOG, store)
    assert quote.price == Decimal(1000)
    assert held is not None
    assert held.quote.price == Decimal(2000)
