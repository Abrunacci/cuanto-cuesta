from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from cuanto_cuesta.domain.errors import CurrencyMismatchError
from cuanto_cuesta.domain.money import Currency, Money, div, mul

HUNDRED = Decimal(100)


class FeeKind(StrEnum):
    FIXED = "fixed"
    PERCENT = "percent"


@dataclass(frozen=True, slots=True)
class Fee:
    """A fee as the user sees it.

    ``value`` is an amount in ``currency`` for fixed fees, and a percentage
    (``Decimal("0.6")`` means 0.6 %) for percent fees, which have no currency.
    """

    id: str
    kind: FeeKind
    value: Decimal
    currency: Currency | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.value, Decimal) or not self.value.is_finite():
            raise ValueError(f"Fee {self.id!r}: value must be a finite Decimal")
        if self.value < 0:
            raise ValueError(f"Fee {self.id!r}: value must not be negative")
        if self.kind is FeeKind.FIXED and self.currency is None:
            raise ValueError(f"Fee {self.id!r}: a fixed fee needs a currency")
        if self.kind is FeeKind.PERCENT:
            if self.currency is not None:
                raise ValueError(f"Fee {self.id!r}: a percent fee has no currency")
            if self.value > HUNDRED:
                raise ValueError(f"Fee {self.id!r}: a percentage cannot exceed 100")

    def with_value(self, value: Decimal) -> Fee:
        return Fee(self.id, self.kind, value, self.currency)

    def charge_on(self, amount: Money) -> Money:
        """Return the fee charged on ``amount``, rounded up to the minor unit."""
        if self.kind is FeeKind.PERCENT:
            return Money(div(mul(amount.amount, self.value), HUNDRED), amount.currency).rounded_up()
        if self.currency is not amount.currency:
            raise CurrencyMismatchError(
                f"Fee {self.id!r} is in {self.currency}, cannot charge it on {amount.currency}"
            )
        return Money(self.value, amount.currency).rounded_up()
