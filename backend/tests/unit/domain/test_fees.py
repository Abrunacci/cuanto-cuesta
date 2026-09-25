from decimal import Decimal

from cuanto_cuesta.domain import Percentage, PercentFee


def test_a_percent_fee_has_no_minimum_by_default() -> None:
    assert PercentFee("pct", Percentage(Decimal(4))).minimum is None
