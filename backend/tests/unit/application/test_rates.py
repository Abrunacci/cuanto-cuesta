from decimal import Decimal

import pytest

from cuanto_cuesta.application import InvalidRateCatalogError, RateCatalog, RateSpec
from cuanto_cuesta.domain import Currency


def spec(key: str = "mep", base: Currency = Currency.USD, low: str = "500") -> RateSpec:
    return RateSpec(key, base, Currency.ARS, Decimal(low), Decimal(50_000), estimated_final=False)


def test_the_range_includes_its_bounds() -> None:
    mep = spec()
    assert mep.in_range(Decimal(500))
    assert mep.in_range(Decimal(50_000))
    assert not mep.in_range(Decimal("499.99"))
    assert not mep.in_range(Decimal("50000.01"))


def test_finds_a_rate_by_key() -> None:
    assert RateCatalog((spec("a"), spec("b"))).get("b") == spec("b")
    assert RateCatalog((spec("a"),)).get("c") is None


@pytest.mark.parametrize(
    ("rates", "message"),
    [
        ((spec("a"), spec("a")), "Duplicate rate key 'a'"),
        ((spec(base=Currency.ARS),), "base and quote must differ"),
        ((spec(low="60000"),), "invalid range 60000..50000"),
        ((spec(low="0"),), "invalid range 0..50000"),
    ],
)
def test_refuses_an_inconsistent_catalog(rates: tuple[RateSpec, ...], message: str) -> None:
    with pytest.raises(InvalidRateCatalogError, match=message):
        RateCatalog(rates)
