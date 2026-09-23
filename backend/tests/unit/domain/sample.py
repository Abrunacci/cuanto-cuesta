"""Fixed fees, rates and routes shaped like the real ones, for hand-checked tests.

The values are test inputs, not the defaults used by the app.
"""

from decimal import Decimal

from cuanto_cuesta.domain import (
    Conversion,
    Currency,
    Fee,
    FixedFee,
    Money,
    Percentage,
    PercentFee,
    Rate,
    Route,
    Step,
)


def _fixed(fee_id: str, value: str, currency: Currency) -> Fee:
    return FixedFee(fee_id, Money(Decimal(value), currency))


def _percent(fee_id: str, value: str, minimum: Money | None = None) -> Fee:
    return PercentFee(fee_id, Percentage(Decimal(value)), minimum)


FEES: dict[str, Fee] = {
    f.id: f
    for f in (
        _fixed("payoneer_p2p_transfer", "4", Currency.USD),
        _percent("p2p_premium", "1"),
        _fixed("binance_p2p_taker", "0.08", Currency.USDT),
        _fixed("binance_withdrawal_polygon", "0.07", Currency.USDT),
        _percent("bitso_taker", "0.6"),
        _fixed("bitso_ars_withdrawal", "0", Currency.ARS),
        _percent("payoneer_us_withdrawal", "4", minimum=Money(Decimal("20"), Currency.USD)),
        _fixed("arq_ach_deposit", "3", Currency.USD),
        _fixed("arq_ars_withdrawal", "0", Currency.ARS),
        _percent("payoneer_ar_withdrawal", "2"),
        _fixed("bank_usd_credit", "0", Currency.USD),
        _percent("broker", "0.05"),
        _percent("byma", "0.02"),
    )
}

MEP = Rate("mep", Currency.USD, Currency.ARS, bid=Decimal("1536.16"), ask=Decimal("1536.16"))

RATES: dict[str, Rate] = {
    r.key: r
    for r in (
        Rate("p2p_usdt_usd", Currency.USDT, Currency.USD, Decimal("1.01"), Decimal("1.03")),
        Rate("bitso_usdt_ars", Currency.USDT, Currency.ARS, Decimal("1596.21"), Decimal("1597.32")),
        Rate("arq_usd_ars", Currency.USD, Currency.ARS, Decimal("1593.385"), Decimal("1597.64")),
        MEP,
    )
}

BINANCE = Route(
    "binance_bitso",
    "Binance + Bitso",
    Currency.USD,
    Currency.ARS,
    (
        Step(
            "Sell USD on Binance P2P",
            fee_ids=("payoneer_p2p_transfer", "p2p_premium", "binance_p2p_taker"),
            conversion=Conversion("p2p_usdt_usd", Currency.USDT),
        ),
        Step("Withdraw to Bitso over Polygon", fee_ids=("binance_withdrawal_polygon",)),
        Step(
            "Sell USDT on Bitso",
            fee_ids=("bitso_taker",),
            conversion=Conversion("bitso_usdt_ars", Currency.ARS),
        ),
        Step("Withdraw to bank", fee_ids=("bitso_ars_withdrawal",)),
    ),
)

ARQ = Route(
    "arq",
    "ARQ",
    Currency.USD,
    Currency.ARS,
    (
        Step("Withdraw from Payoneer to ARQ", fee_ids=("payoneer_us_withdrawal",)),
        Step("ARQ receives ACH", fee_ids=("arq_ach_deposit",)),
        Step("Convert to ARS", conversion=Conversion("arq_usd_ars", Currency.ARS)),
        Step("Withdraw to bank", fee_ids=("arq_ars_withdrawal",)),
    ),
)

MEP_ROUTE = Route(
    "mep",
    "Dólar MEP",
    Currency.USD,
    Currency.ARS,
    (
        Step("Withdraw from Payoneer to a USD account", fee_ids=("payoneer_ar_withdrawal",)),
        Step("Bank credits the transfer", fee_ids=("bank_usd_credit",)),
        Step(
            "Sell through MEP",
            fee_ids=("broker", "byma"),
            conversion=Conversion("mep", Currency.ARS),
        ),
    ),
    warnings=("90-day cross restriction",),
)

ROUTES = (BINANCE, ARQ, MEP_ROUTE)
