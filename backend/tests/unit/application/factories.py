"""Small catalogs for application tests. Values are test inputs, not app defaults."""

from datetime import date
from decimal import Decimal

from cuanto_cuesta.application import FeeDefault, Verified
from cuanto_cuesta.domain import (
    Conversion,
    Currency,
    Fee,
    FixedFee,
    Money,
    Percentage,
    PercentFee,
    Route,
    Step,
)


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def fixed(fee_id: str, value: str, currency: Currency = Currency.USD) -> FixedFee:
    return FixedFee(fee_id, Money(Decimal(value), currency))


def percent(fee_id: str, value: str, minimum: Money | None = None) -> PercentFee:
    return PercentFee(fee_id, Percentage(Decimal(value)), minimum)


def default(fee: Fee) -> FeeDefault:
    return FeeDefault(
        fee=fee,
        label=fee.id,
        provenance=Verified("https://example.com/fees", date(2026, 9, 23)),
    )


def route(route_id: str, *fee_ids: str, rate_key: str = "usd_ars") -> Route:
    """USD -> ARS: the fees are charged in USD, then one conversion."""
    return Route(
        route_id,
        route_id,
        Currency.USD,
        Currency.ARS,
        (Step("Convert", fee_ids, Conversion(rate_key, Currency.ARS)),),
    )
