from decimal import Decimal

import pytest

from cuanto_cuesta.application import Catalog, InvalidCatalogError
from cuanto_cuesta.domain import Conversion, Currency, Fee, Money, Route, Step
from tests.unit.application.factories import default, fixed, percent, route, usd


def test_default_fees_are_keyed_by_id() -> None:
    catalog = Catalog(
        (default(fixed("wire", "3")), default(percent("spread", "1"))),
        (route("r", "wire", "spread"),),
    )
    assert catalog.default_fees() == {"wire": fixed("wire", "3"), "spread": percent("spread", "1")}


def _error(fees: tuple[Fee, ...], routes: tuple[Route, ...]) -> str:
    with pytest.raises(InvalidCatalogError) as info:
        Catalog(tuple(default(f) for f in fees), routes)
    return str(info.value)


class TestReferences:
    def test_rejects_a_duplicate_fee_id(self) -> None:
        message = _error((fixed("wire", "3"), fixed("wire", "4")), (route("r", "wire"),))
        assert "Duplicate fee id 'wire'" in message

    def test_rejects_a_duplicate_route_id(self) -> None:
        message = _error((fixed("wire", "3"),), (route("r", "wire"), route("r", "wire")))
        assert "Duplicate route id 'r'" in message

    def test_rejects_a_route_that_uses_an_unknown_fee(self) -> None:
        message = _error((fixed("wire", "3"),), (route("r", "wire", "ghost"),))
        assert "Route 'r' uses unknown fee 'ghost'" in message

    def test_rejects_a_fee_no_route_uses(self) -> None:
        message = _error((fixed("wire", "3"), fixed("unused", "1")), (route("r", "wire"),))
        assert "Fee 'unused' is not used by any route" in message

    def test_reports_every_problem_at_once(self) -> None:
        message = _error(
            (fixed("wire", "3"), fixed("wire", "3"), fixed("unused", "1")),
            (route("r", "wire", "ghost"),),
        )
        assert "Duplicate fee id" in message
        assert "unknown fee 'ghost'" in message
        assert "'unused' is not used" in message


class TestCaps:
    def test_accepts_fees_at_the_caps(self) -> None:
        Catalog(
            (
                default(fixed("wire", "100")),
                default(percent("spread", "20", minimum=usd("100"))),
                default(fixed("payout", "150000", Currency.ARS)),
            ),
            (
                Route(
                    "r",
                    "r",
                    Currency.USD,
                    Currency.ARS,
                    (Step("Convert", ("wire", "spread", "payout"), Conversion("k", Currency.ARS)),),
                ),
            ),
        )

    @pytest.mark.parametrize(
        ("fee", "expected"),
        [
            (fixed("fee", "100.01"), "Fee 'fee': value must be at most 100"),
            (percent("fee", "20.01"), "Fee 'fee': value must be at most 20"),
            (
                percent("fee", "1", minimum=usd("100.01")),
                "Fee 'fee': minimum must be at most 100",
            ),
            (
                percent("fee", "1", minimum=Money(Decimal("150000.01"), Currency.ARS)),
                "Fee 'fee': minimum must be at most 150000",
            ),
        ],
    )
    def test_rejects_a_default_above_its_cap(self, fee: Fee, expected: str) -> None:
        assert expected in _error((fee,), (route("r", "fee"),))


class TestCurrencies:
    def test_rejects_a_fixed_fee_in_a_currency_the_step_never_holds(self) -> None:
        message = _error((fixed("fee", "1", Currency.USDT),), (route("r", "fee"),))
        assert "Step 'Convert': fee 'fee' is in USDT, expected USD or ARS" in message

    def test_rejects_a_minimum_in_the_wrong_currency(self) -> None:
        minimum = Money(Decimal(1), Currency.ARS)
        message = _error((percent("fee", "1", minimum=minimum),), (route("r", "fee"),))
        assert "fee 'fee' has its minimum in ARS, expected USD" in message

    def test_accepts_a_fixed_fee_in_the_conversion_target(self) -> None:
        Catalog((default(fixed("payout", "10", Currency.ARS)),), (route("r", "payout"),))

    def test_rejects_one_rate_key_for_two_currency_pairs(self) -> None:
        usdt_route = Route(
            "usdt",
            "usdt",
            Currency.USD,
            Currency.ARS,
            (
                Step("Buy USDT", ("fee",), Conversion("k", Currency.USDT)),
                Step("Sell USDT", (), Conversion("k", Currency.ARS)),
            ),
        )
        message = _error((fixed("fee", "1"),), (usdt_route,))
        assert "Rate 'k' (USD/USDT) cannot convert USDT to ARS" in message
