from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Currency, CurrencyMismatchError, Money, Rate

USDT_ARS = Rate(
    "bitso", Currency.USDT, Currency.ARS, bid=Decimal("1596.21"), ask=Decimal("1597.32")
)
USDT_USD = Rate("p2p", Currency.USDT, Currency.USD, bid=Decimal("1.01"), ask=Decimal("1.03"))


def test_selling_the_base_currency_uses_the_bid() -> None:
    result = USDT_ARS.convert(Money(Decimal("100"), Currency.USDT), Currency.ARS)
    assert result == Money(Decimal("159621.00"), Currency.ARS)


def test_buying_the_base_currency_uses_the_ask() -> None:
    result = USDT_USD.convert(Money(Decimal("103"), Currency.USD), Currency.USDT)
    assert result == Money(Decimal("100.00"), Currency.USDT)


def test_conversion_rounds_down_to_the_minor_unit() -> None:
    # 986.00 / 1.03 = 957.2815...
    result = USDT_USD.convert(Money(Decimal("986.00"), Currency.USD), Currency.USDT)
    assert result == Money(Decimal("957.28"), Currency.USDT)


@pytest.mark.parametrize(
    ("source", "target"),
    [(Currency.USD, Currency.ARS), (Currency.USDT, Currency.USD), (Currency.ARS, Currency.ARS)],
)
def test_rejects_currencies_the_rate_does_not_quote(source: Currency, target: Currency) -> None:
    with pytest.raises(CurrencyMismatchError):
        USDT_ARS.convert(Money(Decimal("1"), source), target)


@pytest.mark.parametrize(("bid", "ask"), [("0", "1"), ("1", "-1"), ("NaN", "1")])
def test_rejects_non_positive_prices(bid: str, ask: str) -> None:
    with pytest.raises(ValueError, match="positive"):
        Rate("bad", Currency.USD, Currency.ARS, Decimal(bid), Decimal(ask))


def test_rejects_same_base_and_quote() -> None:
    with pytest.raises(ValueError, match="differ"):
        Rate("bad", Currency.USD, Currency.USD, Decimal(1), Decimal(1))
