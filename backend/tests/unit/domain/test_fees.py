from decimal import Decimal

from cuanto_cuesta.domain import Currency, FixedFee, Money, Percentage, PercentFee


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def test_a_fixed_fee_holds_its_amount() -> None:
    assert FixedFee("fix", usd("3")).amount == usd("3")


def test_a_percent_fee_may_have_a_minimum() -> None:
    assert PercentFee("pct", Percentage(Decimal(4)), usd("20")).minimum == usd("20")


def test_a_percent_fee_may_have_no_minimum() -> None:
    assert PercentFee("pct", Percentage(Decimal(4))).minimum is None
