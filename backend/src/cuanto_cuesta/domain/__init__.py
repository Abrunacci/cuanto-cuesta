"""Pure domain: money, percentages and fees. No I/O, no frameworks."""

from cuanto_cuesta.domain.errors import CurrencyMismatchError, DomainError
from cuanto_cuesta.domain.fees import Fee, FixedFee, PercentFee
from cuanto_cuesta.domain.money import Currency, Money
from cuanto_cuesta.domain.percentage import Percentage

__all__ = [
    "Currency",
    "CurrencyMismatchError",
    "DomainError",
    "Fee",
    "FixedFee",
    "Money",
    "PercentFee",
    "Percentage",
]
