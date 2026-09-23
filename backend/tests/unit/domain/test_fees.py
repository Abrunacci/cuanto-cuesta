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


def percent(value: str, minimum: Money | None = None) -> PercentFee:
    return PercentFee("pct", Percentage(Decimal(value)), minimum)


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


class TestPercentFeeMinimum:
    def test_charges_the_minimum_when_the_percentage_is_lower(self) -> None:
        # 4 % of 100.00 = 4.00 < 20.00
        assert charge(percent("4", minimum=usd("20")), usd("100.00")) == usd("20.00")

    def test_charges_the_percentage_when_it_is_higher(self) -> None:
        # 4 % of 1000.00 = 40.00 > 20.00
        assert charge(percent("4", minimum=usd("20")), usd("1000.00")) == usd("40.00")

    def test_charges_the_minimum_when_both_are_equal(self) -> None:
        # 4 % of 500.00 = 20.00
        assert charge(percent("4", minimum=usd("20")), usd("500.00")) == usd("20.00")

    def test_compares_after_rounding_up(self) -> None:
        # 1 % of 1999.01 = 19.9901 -> 20.00, so the minimum of 19.999 -> 20.00 does not add a cent
        assert charge(percent("1", minimum=usd("19.999")), usd("1999.01")) == usd("20.00")

    def test_minimum_in_another_currency_cannot_be_charged(self) -> None:
        with pytest.raises(CurrencyMismatchError):
            charge(percent("4", minimum=usd("20")), usdt("100"))

    def test_minimum_must_not_be_negative(self) -> None:
        with pytest.raises(ValueError, match="minimum must not be negative"):
            percent("4", minimum=usd("-1"))


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

    def test_percent_fee_drops_the_minimum(self) -> None:
        zeroed = without_charge(percent("4", minimum=usd("20")))
        assert charge(zeroed, usd("100")) == usd("0.00")
