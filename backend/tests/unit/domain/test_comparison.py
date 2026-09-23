from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Currency, CurrencyMismatchError, Money, compare_routes
from cuanto_cuesta.domain.routes import Conversion, Route, Step
from tests.unit.domain.sample import FEES, MEP, RATES, ROUTES


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def ars(amount: str) -> Money:
    return Money(Decimal(amount), Currency.ARS)


def test_routes_are_sorted_best_first() -> None:
    comparison = compare_routes(ROUTES, usd("1000.00"), FEES, RATES, MEP)
    assert [c.result.route.id for c in comparison.routes] == ["arq", "binance_bitso", "mep"]
    assert comparison.at_reference == ars("1536160.00")


def test_losses_split_into_fees_and_exchange_rate() -> None:
    by_id = {
        c.result.route.id: c
        for c in compare_routes(ROUTES, usd("1000.00"), FEES, RATES, MEP).routes
    }

    # Without fees: 1000.00 / 1.03 = 970.87 USDT x 1596.21 = 1549712.4027 -> 1549712.40
    binance = by_id["binance_bitso"]
    assert binance.fee_loss == ars("31110.14")  # 1549712.40 - 1518602.26
    assert binance.fx_loss == ars("-13552.40")  # 1536160.00 - 1549712.40: beats MEP

    # Without fees: 1000.00 x 1593.385 = 1593385.00
    arq = by_id["arq"]
    assert arq.fee_loss == ars("68515.56")
    assert arq.fx_loss == ars("-57225.00")

    # The MEP route converts at the reference itself, so it has no FX loss.
    mep = by_id["mep"]
    assert mep.fee_loss == ars("32535.87")  # 1536160.00 - 1503624.13
    assert mep.fx_loss == ars("0.00")


@pytest.mark.parametrize("amount", ["1.00", "100.00", "1000.00", "12345.67"])
def test_final_plus_losses_equals_the_amount_at_the_reference(amount: str) -> None:
    comparison = compare_routes(ROUTES, usd(amount), FEES, RATES, MEP)
    for item in comparison.routes:
        assert item.final + item.fee_loss + item.fx_loss == comparison.at_reference


def test_ties_are_broken_by_route_id() -> None:
    def mep_route(route_id: str) -> Route:
        return Route(
            route_id,
            route_id,
            Currency.USD,
            Currency.ARS,
            (Step("s", (), Conversion("mep", Currency.ARS)),),
        )

    comparison = compare_routes([mep_route("b"), mep_route("a")], usd("10"), FEES, RATES, MEP)
    assert [c.result.route.id for c in comparison.routes] == ["a", "b"]


def test_routes_must_end_in_the_reference_currency() -> None:
    usdt_route = Route(
        "x",
        "x",
        Currency.USD,
        Currency.USDT,
        (Step("s", (), Conversion("p2p_usdt_usd", Currency.USDT)),),
    )
    with pytest.raises(CurrencyMismatchError):
        compare_routes([usdt_route], usd("10"), FEES, RATES, MEP)
