from decimal import Decimal, localcontext

import pytest

from cuanto_cuesta.domain import Currency, CurrencyMismatchError, Money
from cuanto_cuesta.domain.money import div, mul


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def test_rejects_non_decimal_amounts() -> None:
    with pytest.raises(TypeError):
        Money(10, Currency.USD)  # type: ignore[arg-type]


@pytest.mark.parametrize("amount", ["NaN", "Infinity", "-Infinity"])
def test_rejects_non_finite_amounts(amount: str) -> None:
    with pytest.raises(ValueError, match="finite"):
        usd(amount)


@pytest.mark.parametrize(
    ("amount", "expected"),
    [("1.239", "1.23"), ("1.231", "1.23"), ("1.2", "1.20"), ("-1.239", "-1.23")],
)
def test_credited_amounts_round_down(amount: str, expected: str) -> None:
    assert usd(amount).rounded_down() == usd(expected)


@pytest.mark.parametrize(
    ("amount", "expected"),
    [("1.231", "1.24"), ("1.239", "1.24"), ("1.23", "1.23"), ("0.001", "0.01")],
)
def test_charged_fees_round_up(amount: str, expected: str) -> None:
    assert usd(amount).rounded_up() == usd(expected)


def test_arithmetic_keeps_currency() -> None:
    assert usd("10.50") + usd("0.25") == usd("10.75")
    assert usd("10.50") - usd("0.25") == usd("10.25")


def test_cannot_mix_currencies() -> None:
    ars = Money(Decimal("1"), Currency.ARS)
    with pytest.raises(CurrencyMismatchError):
        _ = usd("1") + ars
    with pytest.raises(CurrencyMismatchError):
        _ = usd("1") - ars


def test_arithmetic_ignores_the_global_decimal_context() -> None:
    with localcontext() as ctx:
        ctx.prec = 3
        assert mul(Decimal("1596.21"), Decimal("951.38")) == Decimal("1518602.2698")
        assert div(Decimal("1"), Decimal("3")) == Decimal("0.3333333333333333333333333333333333")
