from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

import pytest

from cuanto_cuesta.api.wire import (
    MAX_ITEMS,
    decimal_text,
    parse_envelope,
    parse_item,
    timestamp_text,
)
from cuanto_cuesta.application import Malformed, Submission

ITEM: dict[str, object] = {
    "key": "bitso_usdt_ars",
    "base": "USDT",
    "quote": "ARS",
    "price": "1452.30",
    "source": "bitso_api",
    "source_url": "https://bitso.com/ar",
    "observed_at": "2026-10-01T15:00:00Z",
}
BATCH = "0b8e6a3c-5d1f-4c1e-9a77-2f0c8f3e1b20"


class TestEnvelope:
    def test_parses_the_batch_and_its_items(self) -> None:
        assert parse_envelope({"batch_id": BATCH, "rates": [ITEM]}) == (UUID(BATCH), [ITEM])

    @pytest.mark.parametrize(
        "data",
        [
            [],
            {"rates": []},
            {"batch_id": BATCH},
            {"batch_id": "not-a-uuid", "rates": []},
            {"batch_id": BATCH, "rates": {}},
            {"batch_id": BATCH, "rates": [], "fees": []},
            {"batch_id": BATCH, "rates": [ITEM] * (MAX_ITEMS + 1)},
        ],
    )
    def test_refuses_an_envelope_that_does_not_fit(self, data: object) -> None:
        assert parse_envelope(data) is None


class TestItem:
    def test_parses_an_item(self) -> None:
        assert parse_item(ITEM) == Submission(
            key="bitso_usdt_ars",
            base="USDT",
            quote="ARS",
            price="1452.30",
            estimated_final=None,
            sent_estimated_final=False,
            source="bitso_api",
            source_url="https://bitso.com/ar",
            observed_at=datetime(2026, 10, 1, 15, tzinfo=UTC),
        )

    def test_tells_a_null_estimate_from_a_missing_one(self) -> None:
        item = parse_item(ITEM | {"estimated_final": None})
        assert isinstance(item, Submission)
        assert item.sent_estimated_final
        assert item.estimated_final is None

    def test_source_url_is_optional(self) -> None:
        without = {k: v for k, v in ITEM.items() if k != "source_url"}
        assert isinstance(parse_item(without), Submission)
        assert isinstance(parse_item(ITEM | {"source_url": None}), Submission)

    def test_keeps_the_offset_of_the_observation(self) -> None:
        item = parse_item(ITEM | {"observed_at": "2026-10-01T12:00:00-03:00"})
        assert isinstance(item, Submission)
        assert item.observed_at == datetime(2026, 10, 1, 12, tzinfo=timezone(timedelta(hours=-3)))

    @pytest.mark.parametrize(
        "change",
        [
            {"price": Decimal("1452.30")},  # a JSON number, not a string
            {"price": 1452},
            {"source": "Bitso API"},
            {"source": "x" * 65},
            {"source_url": "http://bitso.com"},
            {"source_url": "bitso.com"},
            {"source_url": "https://"},
            {"observed_at": "2026-10-01T15:00:00"},
            {"observed_at": "2026-10-01"},
            {"observed_at": "yesterday"},
            {"observed_at": 1790000000},
            {"extra": "field"},
        ],
    )
    def test_an_item_that_does_not_fit_is_malformed(self, change: dict[str, object]) -> None:
        assert parse_item(ITEM | change) == Malformed("bitso_usdt_ars")

    @pytest.mark.parametrize(
        "item", [None, "text", [], ITEM | {"key": ["bitso_usdt_ars"]}, ITEM | {"key": "k" * 65}]
    )
    def test_a_malformed_item_without_a_usable_key(self, item: object) -> None:
        assert parse_item(item) == Malformed(None)

    def test_a_missing_field_keeps_the_key_for_the_response(self) -> None:
        assert parse_item({"key": "mep"}) == Malformed("mep")


def test_decimals_are_written_without_exponents() -> None:
    assert decimal_text(Decimal("1E+3")) == "1000"
    assert decimal_text(Decimal("1452.30")) == "1452.30"


def test_timestamps_are_written_in_utc() -> None:
    moment = datetime(2026, 10, 1, 12, tzinfo=timezone(timedelta(hours=-3)))
    assert timestamp_text(moment) == "2026-10-01T15:00:00Z"
