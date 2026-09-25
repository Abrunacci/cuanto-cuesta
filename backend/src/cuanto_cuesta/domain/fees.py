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


@dataclass(frozen=True, slots=True)
class PercentFee:
    id: str
    rate: Percentage
    minimum: Money | None = None
    """Charged instead of the percentage when the percentage comes out lower."""


type Fee = FixedFee | PercentFee
