from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Currency, FixedFee, Money, Percentage, PercentFee


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def test_a_fixed_fee_must_not_be_negative() -> None:
    with pytest.raises(ValueError, match="must not be negative"):
        FixedFee("fix", usd("-1"))


def test_a_percent_fee_minimum_must_not_be_negative() -> None:
    with pytest.raises(ValueError, match="minimum must not be negative"):
        PercentFee("pct", Percentage(Decimal(4)), usd("-1"))


def test_a_percent_fee_may_have_no_minimum() -> None:
    assert PercentFee("pct", Percentage(Decimal(4))).minimum is None
