import pytest

from cuanto_cuesta.domain import Conversion, Currency, InvalidRouteError, Route, Step


def route(*steps: Step, target: Currency = Currency.ARS) -> Route:
    return Route("r", "Route", Currency.USD, target, steps)


def test_valid_route_exposes_its_fees_and_rates() -> None:
    r = route(
        Step("fee", fee_ids=("a",)),
        Step("buy", fee_ids=("b",), conversion=Conversion("p2p", Currency.USDT)),
        Step("sell", fee_ids=("a",), conversion=Conversion("bitso", Currency.ARS)),
    )
    assert r.fee_ids() == {"a", "b"}
    assert r.rate_keys() == {"p2p", "bitso"}


def test_rejects_a_route_without_steps() -> None:
    with pytest.raises(InvalidRouteError, match="no steps"):
        route()


def test_rejects_a_step_that_does_nothing() -> None:
    with pytest.raises(InvalidRouteError, match="neither"):
        route(Step("noop"), Step("sell", conversion=Conversion("mep", Currency.ARS)))


def test_rejects_a_route_that_does_not_end_in_the_target_currency() -> None:
    with pytest.raises(InvalidRouteError, match="ends in USDT"):
        route(Step("buy", conversion=Conversion("p2p", Currency.USDT)))


def test_rejects_a_conversion_to_the_same_currency() -> None:
    with pytest.raises(InvalidRouteError, match="to itself"):
        route(Step("noop", conversion=Conversion("x", Currency.USD)), target=Currency.USD)
