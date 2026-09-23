from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from cuanto_cuesta.application import Catalog, FeeStatus, apply_overrides
from cuanto_cuesta.domain import Conversion, Currency, FixedFee, Money, Percentage, PercentFee
from cuanto_cuesta.infrastructure.config import ConfigError, load_catalog

CONFIG_DIR = Path(__file__).parents[2] / "config"

FEES = """\
fees:
  - id: wire
    label: Wire
    kind: fixed
    value: 3.00
    currency: USD
    status: verified
    verified_at: 2026-09-23
    source_url: https://example.com/wire
  - id: spread
    label: Spread
    kind: percent
    value: 0.1
    minimum: {amount: 20, currency: USD}
    upper_bound: true
    status: pending
    verified_at: 2026-09-23
    source_url: https://example.com/spread
    note: Up to 0.1 %.
"""

ROUTES = """\
routes:
  - id: r
    name: Route
    source: USD
    target: ARS
    warnings: [Careful]
    steps:
      - label: Pay
        fees: [wire]
      - label: Convert
        fees: [spread]
        conversion: {rate: usd_ars, to: ARS}
"""


def _load(tmp_path: Path, fees: str = FEES, routes: str = ROUTES) -> Catalog:
    fees_path, routes_path = tmp_path / "fees.yaml", tmp_path / "routes.yaml"
    fees_path.write_text(fees)
    routes_path.write_text(routes)
    return load_catalog(fees_path, routes_path)


def _error(tmp_path: Path, fees: str = FEES, routes: str = ROUTES) -> str:
    with pytest.raises(ConfigError) as info:
        _load(tmp_path, fees, routes)
    return str(info.value)


class TestTheShippedConfig:
    CATALOG = load_catalog(CONFIG_DIR / "fees.yaml", CONFIG_DIR / "routes.yaml")

    def test_has_the_three_routes(self) -> None:
        assert [r.id for r in self.CATALOG.routes] == ["binance_bitso", "arq", "mep"]

    def test_every_fee_links_to_an_https_source(self) -> None:
        assert all(d.source_url.startswith("https://") for d in self.CATALOG.fees)

    def test_charges_the_broker_and_byma_on_each_side_of_the_mep(self) -> None:
        mep = next(r for r in self.CATALOG.routes if r.id == "mep")
        assert {"broker_buy", "broker_sell", "byma_buy", "byma_sell"} <= mep.fee_ids()

    def test_the_payoneer_us_withdrawal_minimum_is_an_estimate(self) -> None:
        withdrawal = next(d for d in self.CATALOG.fees if d.id == "payoneer_us_withdrawal")
        assert withdrawal.fee == PercentFee(
            "payoneer_us_withdrawal",
            Percentage(Decimal(4)),
            Money(Decimal("20.00"), Currency.USD),
        )
        assert withdrawal.status is FeeStatus.PENDING
        assert withdrawal.upper_bound

    def test_the_payoneer_us_withdrawal_minimum_can_be_set_to_zero(self) -> None:
        fees = apply_overrides(self.CATALOG, {}, {"payoneer_us_withdrawal": Decimal(0)})
        assert fees["payoneer_us_withdrawal"] == PercentFee(
            "payoneer_us_withdrawal",
            Percentage(Decimal(4)),
            Money(Decimal(0), Currency.USD),
        )


class TestLoading:
    def test_builds_fees_with_their_metadata(self, tmp_path: Path) -> None:
        catalog = _load(tmp_path)
        wire, spread = catalog.fees
        assert wire.fee == FixedFee("wire", Money(Decimal("3.00"), Currency.USD))
        assert (wire.status, wire.upper_bound, wire.note) == (FeeStatus.VERIFIED, False, None)
        assert spread.fee == PercentFee(
            "spread", Percentage(Decimal("0.1")), Money(Decimal(20), Currency.USD)
        )
        assert spread.verified_at == date(2026, 9, 23)
        assert spread.source_url == "https://example.com/spread"
        assert (spread.status, spread.upper_bound, spread.note) == (
            FeeStatus.PENDING,
            True,
            "Up to 0.1 %.",
        )

    def test_reads_yaml_floats_as_exact_decimals(self, tmp_path: Path) -> None:
        catalog = _load(tmp_path)
        spread = catalog.fees[1].fee
        assert isinstance(spread, PercentFee)
        # As a float, 0.1 would be 0.1000000000000000055511151231257827...
        assert spread.rate.value == Decimal("0.1")

    def test_builds_routes(self, tmp_path: Path) -> None:
        (route,) = _load(tmp_path).routes
        assert route.warnings == ("Careful",)
        assert [s.fee_ids for s in route.steps] == [("wire",), ("spread",)]
        assert route.steps[1].conversion == Conversion("usd_ars", Currency.ARS)


class TestInvalidFiles:
    def test_a_missing_file(self, tmp_path: Path) -> None:
        with pytest.raises(ConfigError, match="cannot read"):
            load_catalog(tmp_path / "nope.yaml", tmp_path / "routes.yaml")

    def test_invalid_yaml(self, tmp_path: Path) -> None:
        assert "invalid YAML" in _error(tmp_path, fees="fees: [")

    def test_a_duplicate_key(self, tmp_path: Path) -> None:
        fees = FEES.replace("    value: 3.00\n", "    value: 3.00\n    value: 0\n")
        assert "duplicate key 'value'" in _error(tmp_path, fees=fees)

    def test_a_float_that_is_not_a_decimal(self, tmp_path: Path) -> None:
        fees = FEES.replace("value: 3.00", "value: .inf")
        assert "cannot read '.inf' as a decimal number" in _error(tmp_path, fees=fees)


class TestInvalidFees:
    @pytest.mark.parametrize(
        ("old", "new", "expected"),
        [
            ("    source_url: https://example.com/wire\n", "", "fees.0.fixed.source_url"),
            ("source_url: https://example.com/wire", "source_url: not a url", "source_url"),
            ("    verified_at: 2026-09-23\n", "", "fees.0.fixed.verified_at"),
            ("status: verified", "status: maybe", "fees.0.fixed.status"),
            ("kind: fixed", "kind: tiered", "fees.0: Input tag 'tiered'"),
            ("id: wire", "id: Wire-Fee", "fees.0.fixed.id"),
            ("    currency: USD\n    status", "    status", "fees.0.fixed.currency"),
            ("value: 3.00", "value: -1", "fees.0.fixed.value"),
            ("value: 0.1", "value: 101", "fees.1.percent.value"),
            ("{amount: 20,", "{amount: -20,", "fees.1.percent.minimum.amount"),
            ("label: Wire", "label: Wire\n    colour: red", "fees.0.fixed.colour"),
        ],
    )
    def test_is_rejected_naming_the_file_and_field(
        self, tmp_path: Path, old: str, new: str, expected: str
    ) -> None:
        assert old in FEES
        message = _error(tmp_path, fees=FEES.replace(old, new))
        assert message.startswith(str(tmp_path / "fees.yaml"))
        assert expected in message

    def test_a_default_above_its_cap(self, tmp_path: Path) -> None:
        message = _error(tmp_path, fees=FEES.replace("value: 0.1", "value: 25"))
        assert "Fee 'spread': value must be at most 20" in message


class TestInvalidRoutes:
    def test_a_broken_currency_chain_names_the_routes_file(self, tmp_path: Path) -> None:
        message = _error(tmp_path, routes=ROUTES.replace("target: ARS", "target: USDT"))
        assert message.startswith(str(tmp_path / "routes.yaml"))
        assert "Route 'r' ends in ARS, expected USDT" in message

    def test_an_unknown_currency(self, tmp_path: Path) -> None:
        assert "routes.0.source" in _error(tmp_path, routes=ROUTES.replace("USD\n", "EUR\n", 1))

    def test_fees_that_do_not_fit_the_routes_name_both_files(self, tmp_path: Path) -> None:
        message = _error(tmp_path, routes=ROUTES.replace("fees: [wire]", "fees: [ghost]"))
        assert f"{tmp_path / 'fees.yaml'} and {tmp_path / 'routes.yaml'}" in message
        assert "Route 'r' uses unknown fee 'ghost'" in message
        assert "Fee 'wire' is not used by any route" in message

    def test_a_fee_in_a_currency_the_step_never_holds(self, tmp_path: Path) -> None:
        fees = FEES.replace(
            "currency: USD\n    status: verified", "currency: USDT\n    status: verified"
        )
        assert "fee 'wire' is in USDT, expected USD" in _error(tmp_path, fees=fees)
