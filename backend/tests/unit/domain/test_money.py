from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Currency, Money


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def test_rejects_non_decimal_amounts() -> None:
    with pytest.raises(TypeError):
        Money(10, Currency.USD)  # type: ignore[arg-type]


@pytest.mark.parametrize("amount", ["NaN", "Infinity", "-Infinity"])
def test_rejects_non_finite_amounts(amount: str) -> None:
    with pytest.raises(ValueError, match="finite"):
        usd(amount)


def test_require_non_negative_accepts_zero_and_rejects_negatives() -> None:
    usd("0").require_non_negative("x")
    with pytest.raises(ValueError, match="x must not be negative"):
        usd("-0.01").require_non_negative("x")
