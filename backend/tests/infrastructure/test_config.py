from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from cuanto_cuesta.application import Catalog, Estimate, UserDefined, Verified
from cuanto_cuesta.domain import Currency, FixedFee, Money, Percentage, PercentFee
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


def _load(tmp_path: Path, fees: str = FEES) -> Catalog:
    fees_path = tmp_path / "fees.yaml"
    fees_path.write_text(fees)
    return load_catalog(fees_path)


def _error(tmp_path: Path, fees: str = FEES) -> str:
    with pytest.raises(ConfigError) as info:
        _load(tmp_path, fees)
    return str(info.value)


class TestTheShippedConfig:
    CATALOG = load_catalog(CONFIG_DIR / "fees.yaml")

    def test_every_fee_links_to_an_https_source(self) -> None:
        for default in self.CATALOG.fees:
            match default.provenance:
                case Verified(source_url=url) | Estimate(source_url=url):
                    pass
                case UserDefined(reference_url=url):
                    pass
            assert url.startswith("https://"), default.id

    def test_the_payoneer_us_withdrawal_minimum_is_an_estimate(self) -> None:
        withdrawal = next(d for d in self.CATALOG.fees if d.id == "payoneer_us_withdrawal")
        assert withdrawal.fee == PercentFee(
            "payoneer_us_withdrawal",
            Percentage(Decimal(4)),
            Money(Decimal("20.00"), Currency.USD),
        )
        assert withdrawal.provenance == Estimate(
            "https://www.payoneer.com/pricing/", date(2026, 9, 23), upper_bound=True
        )

    def test_arq_usd_to_usdc_is_an_editable_estimate_at_par(self) -> None:
        conversion = next(d for d in self.CATALOG.fees if d.id == "arq_usd_usdc_conversion")
        assert conversion.fee == PercentFee("arq_usd_usdc_conversion", Percentage(Decimal(0)))
        assert conversion.provenance == Estimate(
            "https://help.arqfinance.com/es/articles/13901700-recargar-mi-cuenta-con-dolares-usd",
            date(2026, 9, 23),
            upper_bound=False,
        )

    def test_the_binance_card_fee_is_verified_by_an_observation(self) -> None:
        # Binance's page says "up to around 2%"; the final payment screen showed 2 % exactly.
        purchase = next(d for d in self.CATALOG.fees if d.id == "binance_card_purchase")
        assert purchase.fee == PercentFee("binance_card_purchase", Percentage(Decimal(2)))
        assert purchase.provenance == Verified(
            "https://www.binance.com/en/blog/fiat/"
            "can-you-buy-cryptocurrency-with-a-credit-card-421499824684903691",
            date(2026, 9, 25),
        )

    def test_the_p2p_premium_is_set_by_the_user(self) -> None:
        premium = next(d for d in self.CATALOG.fees if d.id == "p2p_premium")
        assert premium.provenance == UserDefined(
            "https://docs.criptoya.com/argentina/", date(2026, 9, 23)
        )


class TestLoading:
    def test_builds_fees_with_their_metadata(self, tmp_path: Path) -> None:
        catalog = _load(tmp_path)
        wire, spread = catalog.fees
        assert wire.fee == FixedFee("wire", Money(Decimal("3.00"), Currency.USD))
        assert wire.provenance == Verified("https://example.com/wire", date(2026, 9, 23))
        assert wire.note is None
        assert spread.fee == PercentFee(
            "spread", Percentage(Decimal("0.1")), Money(Decimal(20), Currency.USD)
        )
        assert spread.provenance == Estimate(
            "https://example.com/spread", date(2026, 9, 23), upper_bound=True
        )
        assert spread.note == "Up to 0.1 %."

    def test_reads_yaml_floats_as_exact_decimals(self, tmp_path: Path) -> None:
        catalog = _load(tmp_path)
        spread = catalog.fees[1].fee
        assert isinstance(spread, PercentFee)
        # As a float, 0.1 would be 0.1000000000000000055511151231257827...
        assert spread.rate.value == Decimal("0.1")


class TestInvalidFiles:
    def test_a_missing_file(self, tmp_path: Path) -> None:
        with pytest.raises(ConfigError, match="cannot read"):
            load_catalog(tmp_path / "nope.yaml")

    def test_a_file_that_is_not_utf8(self, tmp_path: Path) -> None:
        fees_path = tmp_path / "fees.yaml"
        fees_path.write_bytes(b"\xff\xfe" + FEES.encode())
        with pytest.raises(ConfigError, match="not UTF-8"):
            load_catalog(fees_path)

    def test_an_empty_file(self, tmp_path: Path) -> None:
        assert "(root): Input should be a valid dictionary" in _error(tmp_path, fees="")

    def test_invalid_yaml(self, tmp_path: Path) -> None:
        assert "invalid YAML" in _error(tmp_path, fees="fees: [")

    def test_a_duplicate_key(self, tmp_path: Path) -> None:
        fees = FEES.replace("    value: 3.00\n", "    value: 3.00\n    value: 0\n")
        message = _error(tmp_path, fees=fees)
        assert "duplicate key 'value'" in message
        assert "line 6" in message  # the repeated key, not the start of the mapping

    def test_an_unhashable_key(self, tmp_path: Path) -> None:
        assert "found unhashable key" in _error(tmp_path, fees="fees:\n  ? [a]\n  : x\n")

    def test_a_float_that_is_not_a_decimal(self, tmp_path: Path) -> None:
        fees = FEES.replace("value: 3.00", "value: .inf")
        assert "cannot read '.inf' as a decimal number" in _error(tmp_path, fees=fees)


class TestProvenance:
    def test_reads_user_defined(self, tmp_path: Path) -> None:
        fees = FEES.replace("value: 3.00", "value: 0").replace(
            "status: verified", "status: user_defined"
        )
        assert _load(tmp_path, fees=fees).fees[0].provenance == UserDefined(
            "https://example.com/wire", date(2026, 9, 23)
        )

    @pytest.mark.parametrize("value", ["1", "0", '"true"', '"yes"'])
    def test_upper_bound_must_be_a_yaml_boolean(self, tmp_path: Path, value: str) -> None:
        fees = FEES.replace("upper_bound: true", f"upper_bound: {value}")
        message = _error(tmp_path, fees=fees)
        assert "fees.1.percent.upper_bound: Input should be a valid boolean" in message

    def test_a_pending_fee_is_not_an_upper_bound_by_default(self, tmp_path: Path) -> None:
        fees = FEES.replace("    upper_bound: true\n", "")
        assert _load(tmp_path, fees=fees).fees[1].provenance == Estimate(
            "https://example.com/spread", date(2026, 9, 23), upper_bound=False
        )

    @pytest.mark.parametrize("status", ["verified", "user_defined"])
    @pytest.mark.parametrize("upper_bound", ["true", "false"])
    def test_only_a_pending_fee_can_be_an_upper_bound(
        self, tmp_path: Path, status: str, upper_bound: str
    ) -> None:
        fees = FEES.replace("status: pending", f"status: {status}").replace(
            "upper_bound: true", f"upper_bound: {upper_bound}"
        )
        message = _error(tmp_path, fees=fees)
        assert "fees.1.percent: Value error, upper_bound: only a pending fee" in message

    def test_an_upper_bound_with_an_invalid_status_reports_only_the_status(
        self, tmp_path: Path
    ) -> None:
        message = _error(tmp_path, fees=FEES.replace("status: pending", "status: maybe"))
        assert "fees.1.percent.status" in message
        assert "only a pending fee can be an upper bound" not in message

    # Both sample fees as user_defined at their neutral value; each case breaks one of them.
    USER_DEFINED = (
        FEES.replace("value: 3.00", "value: 0")
        .replace("value: 0.1\n    minimum: {amount: 20, currency: USD}", "value: 0")
        .replace("    upper_bound: true\n", "")
        .replace("status: verified", "status: user_defined")
        .replace("status: pending", "status: user_defined")
    )

    def test_a_user_defined_fee_at_zero_loads(self, tmp_path: Path) -> None:
        catalog = _load(tmp_path, fees=self.USER_DEFINED)
        assert all(isinstance(d.provenance, UserDefined) for d in catalog.fees)

    @pytest.mark.parametrize(
        ("old", "new", "where"),
        [
            ("kind: fixed\n    value: 0", "kind: fixed\n    value: 1", "fees.0.fixed"),
            ("kind: percent\n    value: 0", "kind: percent\n    value: 0.1", "fees.1.percent"),
            (
                "kind: percent\n    value: 0",
                "kind: percent\n    value: 0\n    minimum: {amount: 20, currency: USD}",
                "fees.1.percent",
            ),
        ],
    )
    def test_a_user_defined_fee_must_default_to_zero(
        self, tmp_path: Path, old: str, new: str, where: str
    ) -> None:
        assert old in self.USER_DEFINED
        message = _error(tmp_path, fees=self.USER_DEFINED.replace(old, new))
        assert f"{where}: Value error, a user_defined fee must default to 0" in message


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
        assert message.startswith(str(tmp_path / "fees.yaml"))
        assert "Fee 'spread': value must be at most 20" in message

    def test_a_repeated_fee_id(self, tmp_path: Path) -> None:
        message = _error(tmp_path, fees=FEES.replace("id: spread", "id: wire"))
        assert "Duplicate fee id 'wire'" in message
