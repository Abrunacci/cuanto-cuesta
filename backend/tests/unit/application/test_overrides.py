from decimal import Decimal

import pytest

from cuanto_cuesta.application import (
    Catalog,
    InvalidOverridesError,
    OverrideField,
    OverrideProblem,
    apply_overrides,
)
from cuanto_cuesta.domain import (
    Conversion,
    Currency,
    Fee,
    Money,
    Rate,
    Route,
    Step,
    run_route,
)
from tests.unit.application.factories import default, fixed, percent, route, usd

CATALOG = Catalog(
    (
        default(fixed("wire", "3")),
        default(percent("withdrawal", "4", minimum=usd("20"))),
        default(percent("spread", "1")),
        default(fixed("payout", "0", Currency.ARS)),
        default(fixed("usdt_fee", "0", Currency.USDT)),
    ),
    (
        route("r", "wire", "withdrawal", "spread", "payout"),
        Route(
            "usdt",
            "usdt",
            Currency.USD,
            Currency.USDT,
            (Step("Buy USDT", ("usdt_fee",), Conversion("usd_usdt", Currency.USDT)),),
        ),
    ),
)


def dec(value: str) -> Decimal:
    return Decimal(value)


def _problems(
    values: dict[str, Decimal] | None = None, minimums: dict[str, Decimal] | None = None
) -> tuple[OverrideProblem, ...]:
    with pytest.raises(InvalidOverridesError) as info:
        apply_overrides(CATALOG, values or {}, minimums or {})
    return info.value.problems


class TestApplying:
    def test_without_overrides_returns_the_defaults(self) -> None:
        assert apply_overrides(CATALOG, {}, {}) == CATALOG.default_fees()

    def test_a_fixed_fee_keeps_its_currency(self) -> None:
        fees = apply_overrides(CATALOG, {"payout": dec("150")}, {})
        assert fees["payout"] == fixed("payout", "150", Currency.ARS)

    def test_a_percent_fee_keeps_its_minimum(self) -> None:
        fees = apply_overrides(CATALOG, {"withdrawal": dec("1.2")}, {})
        assert fees["withdrawal"] == percent("withdrawal", "1.2", minimum=usd("20"))

    def test_a_minimum_keeps_the_percentage(self) -> None:
        fees = apply_overrides(CATALOG, {}, {"withdrawal": dec("0")})
        assert fees["withdrawal"] == percent("withdrawal", "4", minimum=usd("0"))

    def test_value_and_minimum_together(self) -> None:
        fees = apply_overrides(CATALOG, {"withdrawal": dec("2")}, {"withdrawal": dec("5")})
        assert fees["withdrawal"] == percent("withdrawal", "2", minimum=usd("5"))

    def test_leaves_the_other_fees_and_the_catalog_alone(self) -> None:
        fees = apply_overrides(CATALOG, {"wire": dec("0")}, {})
        assert fees["spread"] == percent("spread", "1")
        assert CATALOG.default_fees()["wire"] == fixed("wire", "3")

    def test_a_zero_minimum_changes_the_result_of_a_small_amount(self) -> None:
        rates = {"usd_ars": Rate("usd_ars", Currency.USD, Currency.ARS, dec("1000"), dec("1000"))}
        amount = usd("100.00")
        with_minimum = run_route(CATALOG.routes[0], amount, apply_overrides(CATALOG, {}, {}), rates)
        without = run_route(
            CATALOG.routes[0], amount, apply_overrides(CATALOG, {}, {"withdrawal": dec("0")}), rates
        )
        # wire 3.00; withdrawal 4 % of 100.00 = 4.00, or the 20.00 minimum; spread 1 % = 1.00
        # 100.00 - 3.00 - 20.00 - 1.00 = 76.00 -> 76000.00 ARS
        # 100.00 - 3.00 -  4.00 - 1.00 = 92.00 -> 92000.00 ARS
        assert with_minimum.final == Money(dec("76000.00"), Currency.ARS)
        assert without.final == Money(dec("92000.00"), Currency.ARS)


class TestCaps:
    @pytest.mark.parametrize(
        ("fee_id", "value", "expected"),
        [
            ("spread", "0", percent("spread", "0")),
            ("spread", "20", percent("spread", "20")),
            ("wire", "100", fixed("wire", "100")),
            ("usdt_fee", "100", fixed("usdt_fee", "100", Currency.USDT)),
            ("payout", "150000", fixed("payout", "150000", Currency.ARS)),
        ],
    )
    def test_accepts_zero_and_the_cap(self, fee_id: str, value: str, expected: Fee) -> None:
        assert apply_overrides(CATALOG, {fee_id: dec(value)}, {})[fee_id] == expected

    @pytest.mark.parametrize(
        ("fee_id", "value", "message"),
        [
            ("spread", "20.01", "must be at most 20, got 20.01"),
            ("wire", "100.01", "must be at most 100, got 100.01"),
            ("usdt_fee", "100.01", "must be at most 100, got 100.01"),
            ("payout", "150000.01", "must be at most 150000, got 150000.01"),
            ("wire", "-0.01", "must not be negative, got -0.01"),
            ("spread", "NaN", "must be a finite number, got NaN"),
            ("wire", "Infinity", "must be a finite number, got Infinity"),
        ],
    )
    def test_rejects_a_value_outside_the_caps(self, fee_id: str, value: str, message: str) -> None:
        assert _problems(values={fee_id: dec(value)}) == (
            OverrideProblem(fee_id, OverrideField.VALUE, message),
        )

    @pytest.mark.parametrize(
        ("value", "message"),
        [("100.01", "must be at most 100, got 100.01"), ("-1", "must not be negative, got -1")],
    )
    def test_rejects_a_minimum_outside_the_caps(self, value: str, message: str) -> None:
        assert _problems(minimums={"withdrawal": dec(value)}) == (
            OverrideProblem("withdrawal", OverrideField.MINIMUM, message),
        )


class TestIds:
    def test_rejects_an_unknown_fee(self) -> None:
        assert _problems(values={"ghost": dec("1")}) == (
            OverrideProblem("ghost", OverrideField.VALUE, "unknown fee"),
        )

    @pytest.mark.parametrize("fee_id", ["spread", "wire"])
    def test_rejects_a_minimum_for_a_fee_without_one(self, fee_id: str) -> None:
        assert _problems(minimums={fee_id: dec("1")}) == (
            OverrideProblem(fee_id, OverrideField.MINIMUM, "this fee has no minimum"),
        )


def test_reports_every_problem_at_once() -> None:
    problems = _problems(
        values={"wire": dec("-1"), "ghost": dec("1")}, minimums={"spread": dec("1")}
    )
    assert {(p.fee_id, p.field) for p in problems} == {
        ("ghost", OverrideField.VALUE),
        ("wire", OverrideField.VALUE),
        ("spread", OverrideField.MINIMUM),
    }
