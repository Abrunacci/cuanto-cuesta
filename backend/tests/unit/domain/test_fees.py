from decimal import Decimal

import pytest

from cuanto_cuesta.domain import Currency, CurrencyMismatchError, Fee, FeeKind, Money


def percent(value: str) -> Fee:
    return Fee("pct", FeeKind.PERCENT, Decimal(value))


def fixed(value: str, currency: Currency = Currency.USD) -> Fee:
    return Fee("fix", FeeKind.FIXED, Decimal(value), currency)


def test_percent_fee_is_a_percentage_of_the_amount() -> None:
    fee = percent("1").charge_on(Money(Decimal("1000.00"), Currency.USD))
    assert fee == Money(Decimal("10.00"), Currency.USD)


def test_percent_fee_rounds_up_to_the_minor_unit() -> None:
    # 0.6 % of 957.13 = 5.74278
    fee = percent("0.6").charge_on(Money(Decimal("957.13"), Currency.USDT))
    assert fee == Money(Decimal("5.75"), Currency.USDT)


def test_percent_fee_is_charged_in_the_amount_currency() -> None:
    fee = percent("0.6").charge_on(Money(Decimal("100"), Currency.ARS))
    assert fee.currency is Currency.ARS


def test_fixed_fee_ignores_the_amount() -> None:
    fee = fixed("3").charge_on(Money(Decimal("957.00"), Currency.USD))
    assert fee == Money(Decimal("3.00"), Currency.USD)


def test_fixed_fee_rounds_up_to_the_minor_unit() -> None:
    fee = fixed("0.075", Currency.USDT).charge_on(Money(Decimal("10"), Currency.USDT))
    assert fee == Money(Decimal("0.08"), Currency.USDT)


def test_fixed_fee_in_another_currency_cannot_be_charged() -> None:
    with pytest.raises(CurrencyMismatchError):
        fixed("0.07", Currency.USDT).charge_on(Money(Decimal("10"), Currency.USD))


def test_zero_fee_charges_nothing() -> None:
    assert percent("0").charge_on(Money(Decimal("10"), Currency.USD)).amount == 0


def test_with_value_keeps_identity() -> None:
    fee = fixed("4").with_value(Decimal("2.5"))
    assert (fee.id, fee.kind, fee.value, fee.currency) == (
        "fix",
        FeeKind.FIXED,
        Decimal("2.5"),
        Currency.USD,
    )


@pytest.mark.parametrize(
    ("kind", "value", "currency", "message"),
    [
        (FeeKind.FIXED, "-1", Currency.USD, "negative"),
        (FeeKind.PERCENT, "-0.1", None, "negative"),
        (FeeKind.PERCENT, "100.01", None, "exceed 100"),
        (FeeKind.FIXED, "1", None, "needs a currency"),
        (FeeKind.PERCENT, "1", Currency.USD, "no currency"),
        (FeeKind.PERCENT, "NaN", None, "finite"),
    ],
)
def test_rejects_invalid_fees(
    kind: FeeKind, value: str, currency: Currency | None, message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        Fee("bad", kind, Decimal(value), currency)
