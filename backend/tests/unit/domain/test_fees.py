from decimal import Decimal

import pytest

from cuanto_cuesta.domain import (
    Currency,
    CurrencyMismatchError,
    FixedFee,
    Money,
    Percentage,
    PercentFee,
    charge,
    without_charge,
)


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def usdt(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USDT)


def percent(value: str) -> PercentFee:
    return PercentFee("pct", Percentage(Decimal(value)))


class TestPercentFee:
    def test_is_a_percentage_of_the_amount(self) -> None:
        assert charge(percent("1"), usd("1000.00")) == usd("10.00")

    def test_rounds_up_to_the_minor_unit(self) -> None:
        # 0.6 % of 957.13 = 5.74278
        assert charge(percent("0.6"), usdt("957.13")) == usdt("5.75")

    def test_is_charged_in_the_amount_currency(self) -> None:
        assert charge(percent("0.6"), usdt("100")).currency is Currency.USDT

    def test_zero_charges_nothing(self) -> None:
        assert charge(percent("0"), usd("10")) == usd("0.00")


class TestFixedFee:
    def test_ignores_the_amount(self) -> None:
        assert charge(FixedFee("fix", usd("3")), usd("957.00")) == usd("3.00")

    def test_rounds_up_to_the_minor_unit(self) -> None:
        assert charge(FixedFee("fix", usdt("0.075")), usdt("10")) == usdt("0.08")

    def test_in_another_currency_cannot_be_charged(self) -> None:
        with pytest.raises(CurrencyMismatchError):
            charge(FixedFee("fix", usdt("0.07")), usd("10"))

    def test_must_not_be_negative(self) -> None:
        with pytest.raises(ValueError, match="must not be negative"):
            FixedFee("fix", usd("-1"))


class TestWithoutCharge:
    def test_fixed_fee_keeps_id_and_currency(self) -> None:
        assert without_charge(FixedFee("fix", usdt("0.07"))) == FixedFee("fix", usdt("0"))

    def test_percent_fee_charges_nothing(self) -> None:
        assert charge(without_charge(percent("4")), usd("100")) == usd("0.00")
