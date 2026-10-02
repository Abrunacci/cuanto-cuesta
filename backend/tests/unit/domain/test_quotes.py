from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Arrival, Quote, arrival

AT = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)


def quote(price: str = "1452.30", at: datetime = AT, estimated: str | None = None) -> Quote:
    return Quote(
        key="bitso_usdt_ars",
        price=Decimal(price),
        estimated_final=None if estimated is None else Decimal(estimated),
        source="bitso_api",
        source_url=None,
        observed_at=at,
    )


class TestQuote:
    @pytest.mark.parametrize("price", ["0", "-1", "NaN", "Infinity"])
    def test_refuses_a_price_that_is_not_positive_and_finite(self, price: str) -> None:
        with pytest.raises(ValueError, match="price must be positive"):
            quote(price)

    def test_refuses_an_estimate_that_is_not_positive(self) -> None:
        with pytest.raises(ValueError, match="estimated_final must be positive"):
            quote(estimated="0")

    def test_refuses_a_float(self) -> None:
        with pytest.raises(TypeError):
            Quote("k", 1.5, None, "s", None, AT)  # type: ignore[arg-type]

    def test_refuses_a_time_without_a_zone(self) -> None:
        with pytest.raises(ValueError, match="time zone"):
            quote(at=AT.replace(tzinfo=None))

    def test_trailing_zeros_are_the_same_value(self) -> None:
        assert quote("1452.3").same_values(quote("1452.30"))

    def test_a_different_estimate_is_a_different_value(self) -> None:
        assert not quote(estimated="0.97").same_values(quote(estimated="0.98"))
        assert not quote(estimated="0.97").same_values(quote())


class TestArrival:
    def test_the_first_quote_is_newer(self) -> None:
        assert arrival(None, quote()) is Arrival.NEWER

    def test_a_later_observation_is_newer_whatever_its_value(self) -> None:
        assert arrival(quote(), quote(at=AT + timedelta(seconds=1))) is Arrival.NEWER

    def test_an_earlier_observation_is_older_whatever_its_value(self) -> None:
        assert arrival(quote(), quote("1500", at=AT - timedelta(seconds=1))) is Arrival.OLDER

    def test_the_same_time_and_value_is_the_same_quote(self) -> None:
        assert arrival(quote("1452.30"), quote("1452.3")) is Arrival.SAME

    def test_the_same_time_with_another_value_is_a_conflict(self) -> None:
        assert arrival(quote("1452.30"), quote("1452.31")) is Arrival.CONFLICT

    def test_times_in_different_zones_are_compared_as_instants(self) -> None:
        same_instant = AT.astimezone(timezone(timedelta(hours=-3)))
        assert arrival(quote(), quote(at=same_instant)) is Arrival.SAME
