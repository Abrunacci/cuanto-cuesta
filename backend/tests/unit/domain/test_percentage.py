from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Currency, Money, Percentage


@pytest.mark.parametrize("value", ["0", "0.01", "100"])
def test_accepts_values_from_zero_to_a_hundred(value: str) -> None:
    assert Percentage(Decimal(value)).value == Decimal(value)


@pytest.mark.parametrize("value", ["-0.01", "100.01", "NaN", "Infinity"])
def test_rejects_values_outside_zero_to_a_hundred(value: str) -> None:
    with pytest.raises(ValueError, match="between 0 and 100"):
        Percentage(Decimal(value))


def test_rejects_non_decimal_values() -> None:
    with pytest.raises(TypeError):
        Percentage(1)  # type: ignore[arg-type]


def test_share_of_an_amount_is_exact() -> None:
    share = Percentage(Decimal("0.6")).of(Money(Decimal("957.13"), Currency.USDT))
    assert share == Money(Decimal("5.74278"), Currency.USDT)
