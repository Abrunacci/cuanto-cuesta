"""Fees are one of two types, so an invalid combination cannot be built.

* ``FixedFee``: a fixed amount of money.
* ``PercentFee``: a percentage of the amount, with an optional minimum.

Value rules live in ``Money`` and ``Percentage``.
"""

from __future__ import annotations

from dataclasses import dataclass

from cuanto_cuesta.domain.money import Money
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
