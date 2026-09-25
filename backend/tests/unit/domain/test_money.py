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


def test_accepts_zero() -> None:
    assert usd("0").amount == Decimal(0)


@pytest.mark.parametrize("amount", ["-0.01", "-1"])
def test_rejects_negative_amounts(amount: str) -> None:
    with pytest.raises(ValueError, match="must not be negative"):
        usd(amount)
