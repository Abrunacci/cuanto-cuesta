from decimal import Decimal

import pytest

from cuanto_cuesta.application import Catalog, InvalidCatalogError
from cuanto_cuesta.domain import Currency, Fee, Money
from tests.unit.application.factories import default, fixed, percent, usd


def test_default_fees_are_keyed_by_id() -> None:
    catalog = Catalog((default(fixed("wire", "3")), default(percent("spread", "1"))))
    assert catalog.default_fees() == {"wire": fixed("wire", "3"), "spread": percent("spread", "1")}


def _error(*fees: Fee) -> str:
    with pytest.raises(InvalidCatalogError) as info:
        Catalog(tuple(default(f) for f in fees))
    return str(info.value)


def test_rejects_a_duplicate_fee_id() -> None:
    assert "Duplicate fee id 'wire'" in _error(fixed("wire", "3"), fixed("wire", "4"))


def test_reports_every_problem_at_once() -> None:
    message = _error(fixed("wire", "3"), fixed("wire", "3"), fixed("big", "101"))
    assert "Duplicate fee id 'wire'" in message
    assert "Fee 'big': value must be at most 100" in message


class TestCaps:
    def test_accepts_fees_at_the_caps(self) -> None:
        Catalog(
            (
                default(fixed("wire", "100")),
                default(percent("spread", "20", minimum=usd("100"))),
                default(fixed("payout", "150000", Currency.ARS)),
            )
        )

    @pytest.mark.parametrize(
        ("fee", "expected"),
        [
            (fixed("fee", "100.01"), "Fee 'fee': value must be at most 100"),
            (percent("fee", "20.01"), "Fee 'fee': value must be at most 20"),
            (
                percent("fee", "1", minimum=usd("100.01")),
                "Fee 'fee': minimum must be at most 100",
            ),
            (
                percent("fee", "1", minimum=Money(Decimal("150000.01"), Currency.ARS)),
                "Fee 'fee': minimum must be at most 150000",
            ),
        ],
    )
    def test_rejects_a_default_above_its_cap(self, fee: Fee, expected: str) -> None:
        assert expected in _error(fee)
