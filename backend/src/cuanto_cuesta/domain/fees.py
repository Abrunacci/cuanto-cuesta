"""Fees are one of two types, so an invalid combination cannot be built.

* ``FixedFee``: a fixed amount of money.
* ``PercentFee``: a percentage of the amount, with an optional minimum.

Value rules live in ``Money`` and ``Percentage``; ``charge`` rounds every fee
up to the minor unit, as the rounding policy in ``money`` requires.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import assert_never

from cuanto_cuesta.domain.errors import CurrencyMismatchError
from cuanto_cuesta.domain.money import Currency, Money
from cuanto_cuesta.domain.percentage import Percentage


@dataclass(frozen=True, slots=True)
class FixedFee:
    id: str
    amount: Money

    def __post_init__(self) -> None:
        self.amount.require_non_negative(f"Fee {self.id!r}")


@dataclass(frozen=True, slots=True)
class PercentFee:
    id: str
    rate: Percentage
    minimum: Money | None = None
    """Charged instead of the percentage when the percentage comes out lower."""

    def __post_init__(self) -> None:
        if self.minimum is not None:
            self.minimum.require_non_negative(f"Fee {self.id!r} minimum")


type Fee = FixedFee | PercentFee


def charge(fee: Fee, amount: Money) -> Money:
    """The fee charged on ``amount``, rounded up to the minor unit."""
    match fee:
        case FixedFee(amount=fixed):
            _require_currency(fee.id, fixed.currency, amount.currency)
            return fixed.rounded_up()
        case PercentFee(rate=rate, minimum=minimum):
            share = rate.of(amount).rounded_up()
            if minimum is None:
                return share
            _require_currency(fee.id, minimum.currency, amount.currency)
            floor = minimum.rounded_up()
            return floor if share < floor else share
        case _:
            assert_never(fee)


def without_charge(fee: Fee) -> Fee:
    """The same fee set to zero, minimum included."""
    match fee:
        case FixedFee(amount=fixed):
            return FixedFee(fee.id, Money.zero(fixed.currency))
        case PercentFee():
            return PercentFee(fee.id, Percentage(Decimal(0)))
        case _:
            assert_never(fee)


def _require_currency(fee_id: str, fee_currency: Currency, amount_currency: Currency) -> None:
    if fee_currency is not amount_currency:
        raise CurrencyMismatchError(
            f"Fee {fee_id!r} is in {fee_currency}, cannot charge it on {amount_currency}"
        )
