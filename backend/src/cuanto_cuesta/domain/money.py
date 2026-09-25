"""Money and currencies: an exact, non-negative decimal amount in a currency, never a float.

The backend only holds and validates amounts, all of them fees, so a negative one cannot be
built. The calculation, and the rounding policy that goes with it, live in the calculator
(``frontend/src/calculator/money.ts``).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum


class Currency(StrEnum):
    USD = "USD"
    USDT = "USDT"
    USDC = "USDC"
    ARS = "ARS"


@dataclass(frozen=True, slots=True)
class Money:
    amount: Decimal
    currency: Currency

    def __post_init__(self) -> None:
        if not isinstance(self.amount, Decimal):
            raise TypeError(f"Money amount must be Decimal, got {type(self.amount).__name__}")
        if not self.amount.is_finite():
            raise ValueError(f"Money amount must be finite, got {self.amount}")
        if self.amount < 0:
            raise ValueError(f"Money amount must not be negative, got {self.amount}")

    def __str__(self) -> str:
        return f"{self.amount} {self.currency}"
