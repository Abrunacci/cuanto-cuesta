from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from cuanto_cuesta.domain.money import Money, div, mul

HUNDRED = Decimal(100)


@dataclass(frozen=True, slots=True)
class Percentage:
    """A percentage between 0 and 100 inclusive: ``Decimal("0.6")`` means 0.6 %."""

    value: Decimal

    def __post_init__(self) -> None:
        if not isinstance(self.value, Decimal):
            raise TypeError(f"Percentage must be Decimal, got {type(self.value).__name__}")
        if not self.value.is_finite() or not 0 <= self.value <= HUNDRED:
            raise ValueError(f"Percentage must be between 0 and 100, got {self.value}")

    def of(self, amount: Money) -> Money:
        """The exact, unrounded share of ``amount``."""
        return Money(div(mul(amount.amount, self.value), HUNDRED), amount.currency)
