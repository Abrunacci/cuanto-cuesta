"""Money, currencies and the single place where rounding happens.

Rounding policy:

* Intermediate arithmetic runs in ``CALC_CONTEXT`` (34 significant digits,
  half-even), independent of the process-wide decimal context.
* An amount *credited to the user* (the output of every step) is rounded
  **down** to the currency's minor unit: the tool never promises more than a
  platform would actually credit.
* A fee *charged to the user* is rounded **up** to the currency's minor unit,
  for the same conservative reason.

Nothing else in the domain rounds.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, ROUND_HALF_EVEN, ROUND_UP, Context, Decimal
from enum import StrEnum

from cuanto_cuesta.domain.errors import CurrencyMismatchError

CALC_CONTEXT = Context(prec=34, rounding=ROUND_HALF_EVEN)


class Currency(StrEnum):
    USD = "USD"
    USDT = "USDT"
    USDC = "USDC"
    ARS = "ARS"


_MINOR_UNIT: dict[Currency, Decimal] = {
    Currency.USD: Decimal("0.01"),
    Currency.USDT: Decimal("0.01"),
    Currency.USDC: Decimal("0.01"),
    Currency.ARS: Decimal("0.01"),
}


def minor_unit(currency: Currency) -> Decimal:
    return _MINOR_UNIT[currency]


def mul(a: Decimal, b: Decimal) -> Decimal:
    return CALC_CONTEXT.multiply(a, b)


def div(a: Decimal, b: Decimal) -> Decimal:
    return CALC_CONTEXT.divide(a, b)


@dataclass(frozen=True, slots=True)
class Money:
    amount: Decimal
    currency: Currency

    def __post_init__(self) -> None:
        if not isinstance(self.amount, Decimal):
            raise TypeError(f"Money amount must be Decimal, got {type(self.amount).__name__}")
        if not self.amount.is_finite():
            raise ValueError(f"Money amount must be finite, got {self.amount}")

    @classmethod
    def zero(cls, currency: Currency) -> Money:
        return cls(Decimal(0), currency)

    def __add__(self, other: Money) -> Money:
        self._check_same_currency(other)
        return Money(CALC_CONTEXT.add(self.amount, other.amount), self.currency)

    def __sub__(self, other: Money) -> Money:
        self._check_same_currency(other)
        return Money(CALC_CONTEXT.subtract(self.amount, other.amount), self.currency)

    def __lt__(self, other: Money) -> bool:
        self._check_same_currency(other)
        return self.amount < other.amount

    def is_negative(self) -> bool:
        return self.amount < 0

    def require_non_negative(self, what: str) -> None:
        """Money is signed (a loss can be a gain); call this where only >= 0 makes sense."""
        if self.is_negative():
            raise ValueError(f"{what} must not be negative, got {self}")

    def rounded_down(self) -> Money:
        """Round an amount credited to the user."""
        return self._quantize(ROUND_DOWN)

    def rounded_up(self) -> Money:
        """Round a fee charged to the user."""
        return self._quantize(ROUND_UP)

    def _quantize(self, rounding: str) -> Money:
        return Money(
            self.amount.quantize(minor_unit(self.currency), rounding=rounding), self.currency
        )

    def _check_same_currency(self, other: Money) -> None:
        if self.currency is not other.currency:
            raise CurrencyMismatchError(
                f"Cannot combine {self.currency} and {other.currency} amounts"
            )

    def __str__(self) -> str:
        return f"{self.amount} {self.currency}"
