from decimal import Decimal

import pytest

from cuanto_cuesta.domain import (
    Conversion,
    Currency,
    CurrencyMismatchError,
    Fee,
    FixedFee,
    Money,
    Percentage,
    PercentFee,
    Route,
    Step,
    UnknownFeeError,
    UnknownRateError,
    run_route,
)
from tests.unit.domain.sample import ARQ, BINANCE, FEES, MEP_ROUTE, RATES


def usd(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USD)


def ars(amount: str) -> Money:
    return Money(Decimal(amount), Currency.ARS)


def usdt(amount: str) -> Money:
    return Money(Decimal(amount), Currency.USDT)


class TestRoutesStepByStep:
    """Every expected value below is worked out by hand in the comments."""

    def test_binance_bitso(self) -> None:
        result = run_route(BINANCE, usd("1000.00"), FEES, RATES)
        p2p, withdrawal, bitso, bank = result.steps

        # 1000.00 - 4.00 fixed - 1 % (10.00) = 986.00 USD
        # 986.00 / ask 1.03 = 957.2815... -> 957.28 USDT, minus 0.08 USDT taker = 957.20
        assert [c.amount for c in p2p.fees] == [usd("4.00"), usd("10.00"), usdt("0.08")]
        assert p2p.rate is RATES["p2p_usdt_usd"]
        assert p2p.amount_out == usdt("957.20")

        assert withdrawal.amount_out == usdt("957.13")

        # 0.6 % of 957.13 = 5.74278 -> 5.75; 951.38 x bid 1596.21 = 1518602.2698
        assert [c.amount for c in bitso.fees] == [usdt("5.75")]
        assert bitso.amount_out == ars("1518602.26")

        assert bank.amount_out == ars("1518602.26")
        assert result.final == ars("1518602.26")
        assert not result.exhausted

    def test_arq(self) -> None:
        result = run_route(ARQ, usd("1000.00"), FEES, RATES)

        # 1000.00 - 4 % = 960.00; - 3.00 = 957.00; x bid 1593.385 = 1524869.445
        assert [s.amount_out for s in result.steps] == [
            usd("960.00"),
            usd("957.00"),
            ars("1524869.44"),
            ars("1524869.44"),
        ]

    def test_arq_below_the_payoneer_minimum(self) -> None:
        result = run_route(ARQ, usd("100.00"), FEES, RATES)

        # 4 % of 100.00 = 4.00, below the 20.00 minimum: 80.00; - 3.00 = 77.00
        # 77.00 x 1593.385 = 122690.645
        assert result.steps[0].fees[0].amount == usd("20.00")
        assert result.final == ars("122690.64")

    def test_mep(self) -> None:
        result = run_route(MEP_ROUTE, usd("1000.00"), FEES, RATES)
        sale = result.steps[2]

        # 1000.00 - 2 % = 980.00
        # broker 0.05 % = 0.49; BYMA 0.01 % per side = 0.098 -> 0.10 twice
        # 979.31 x 1536.16 = 1504376.8496
        assert [c.amount for c in sale.fees] == [usd("0.49"), usd("0.10"), usd("0.10")]
        assert sale.amount_in == usd("980.00")
        assert result.final == ars("1504376.84")


class TestFeesInsideAStep:
    RATE_KEY = "p2p_usdt_usd"

    def run(self, *fees: Fee, amount: str = "100.00") -> Money:
        step = Step("s", tuple(f.id for f in fees), Conversion(self.RATE_KEY, Currency.USDT))
        route = Route("r", "r", Currency.USD, Currency.USDT, (step,))
        return run_route(route, usd(amount), {f.id: f for f in fees}, RATES).final

    def test_percent_fees_apply_to_the_step_input_not_to_each_other(self) -> None:
        a = PercentFee("a", Percentage(Decimal("10")))
        b = PercentFee("b", Percentage(Decimal("10")))
        # 100.00 - 10.00 - 10.00 = 80.00 USD; 80.00 / 1.03 = 77.669... -> 77.66
        assert self.run(a, b) == usdt("77.66")

    def test_fixed_fee_in_the_input_currency_is_charged_before_converting(self) -> None:
        fee = FixedFee("f", usd("3"))
        # 97.00 / 1.03 = 94.174... -> 94.17
        assert self.run(fee) == usdt("94.17")

    def test_fixed_fee_in_the_target_currency_is_charged_after_converting(self) -> None:
        fee = FixedFee("f", usdt("3"))
        # 100.00 / 1.03 = 97.087... -> 97.08; - 3.00 = 94.08
        assert self.run(fee) == usdt("94.08")

    def test_fixed_fee_in_an_unrelated_currency_is_rejected(self) -> None:
        with pytest.raises(CurrencyMismatchError):
            self.run(FixedFee("f", ars("3")))

    def test_fees_larger_than_the_amount_leave_zero(self) -> None:
        fee = FixedFee("f", usd("20"))
        step = Step("s", ("f",))
        route = Route("r", "r", Currency.USD, Currency.USD, (step, Step("t", ("f",))))
        result = run_route(route, usd("5.00"), {"f": fee}, {})
        assert result.final == usd("0")
        assert result.exhausted


class TestInvalidInput:
    def test_amount_must_be_in_the_route_source_currency(self) -> None:
        with pytest.raises(CurrencyMismatchError):
            run_route(ARQ, ars("1000"), FEES, RATES)

    def test_missing_fee(self) -> None:
        fees = {k: v for k, v in FEES.items() if k != "arq_ach_deposit"}
        with pytest.raises(UnknownFeeError, match="arq_ach_deposit"):
            run_route(ARQ, usd("1000"), fees, RATES)

    def test_missing_rate(self) -> None:
        with pytest.raises(UnknownRateError, match="arq_usd_ars"):
            run_route(ARQ, usd("1000"), FEES, {})
