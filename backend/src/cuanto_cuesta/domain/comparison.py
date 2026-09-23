"""Compare routes and split each route's cost into fees and exchange rate.

Against a reference rate (the MEP dollar) every result decomposes exactly::

    amount x reference = final + fee_loss + fx_loss

* ``fee_loss`` is how many more target units the route would deliver if every
  fee were zero, i.e. the counterfactual run minus the actual run. It accounts
  for fees compounding through later conversions.
* ``fx_loss`` is the rest: how far the route's rates (and rounding) fall short
  of the reference. It is negative when the route beats the reference.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from cuanto_cuesta.domain.calculation import RouteResult, run_route
from cuanto_cuesta.domain.errors import CurrencyMismatchError
from cuanto_cuesta.domain.fees import Fee, without_charge
from cuanto_cuesta.domain.money import Money
from cuanto_cuesta.domain.rates import Rate
from cuanto_cuesta.domain.routes import Route


@dataclass(frozen=True, slots=True)
class RouteComparison:
    result: RouteResult
    fee_loss: Money
    fx_loss: Money

    @property
    def final(self) -> Money:
        return self.result.final


@dataclass(frozen=True, slots=True)
class Comparison:
    amount: Money
    reference: Rate
    at_reference: Money
    routes: tuple[RouteComparison, ...]
    """Best route first."""


def compare_routes(
    routes: Iterable[Route],
    amount: Money,
    fees: Mapping[str, Fee],
    rates: Mapping[str, Rate],
    reference: Rate,
) -> Comparison:
    at_reference = reference.convert(amount, reference.quote)
    compared = [_compare_one(route, amount, fees, rates, at_reference) for route in routes]
    compared.sort(key=lambda c: (-c.final.amount, c.result.route.id))
    return Comparison(amount, reference, at_reference, tuple(compared))


def _compare_one(
    route: Route,
    amount: Money,
    fees: Mapping[str, Fee],
    rates: Mapping[str, Rate],
    at_reference: Money,
) -> RouteComparison:
    if route.target is not at_reference.currency:
        raise CurrencyMismatchError(
            f"Route {route.id!r} ends in {route.target}, the reference is in "
            f"{at_reference.currency}"
        )
    actual = run_route(route, amount, fees, rates)
    without_fees = run_route(route, amount, _zeroed(fees, route), rates)
    return RouteComparison(
        result=actual,
        fee_loss=without_fees.final - actual.final,
        fx_loss=at_reference - without_fees.final,
    )


def _zeroed(fees: Mapping[str, Fee], route: Route) -> dict[str, Fee]:
    """The route's fees set to zero; missing ids are left for run_route to report."""
    return {fee_id: without_charge(fees[fee_id]) for fee_id in route.fee_ids() if fee_id in fees}
