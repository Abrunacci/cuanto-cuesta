from decimal import Decimal
from pathlib import Path

import pytest

from cuanto_cuesta.application import RateCatalog, RateSpec
from cuanto_cuesta.domain import Currency
from cuanto_cuesta.infrastructure.config import ConfigError, load_rate_catalog

CONFIG_DIR = Path(__file__).parents[2] / "config"

RATES = """\
rates:
  - {key: mep, base: USD, quote: ARS, min: 500, max: 50000}
  - {key: card, base: USD, quote: USDT, min: 0.5, max: 2, estimated_final: true}
"""


def _load(tmp_path: Path, text: str) -> RateCatalog:
    path = tmp_path / "rates.yaml"
    path.write_text(text)
    return load_rate_catalog(path)


def test_loads_the_rates_with_exact_decimals(tmp_path: Path) -> None:
    assert _load(tmp_path, RATES).rates == (
        RateSpec("mep", Currency.USD, Currency.ARS, Decimal(500), Decimal(50_000), False),
        RateSpec("card", Currency.USD, Currency.USDT, Decimal("0.5"), Decimal(2), True),
    )


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (RATES.replace("USDT", "EUR"), "rates.1.quote"),
        (RATES.replace("min: 500", "min: -1"), "rates.0.min"),
        (RATES.replace("estimated_final: true", "estimated_final: yes please"), "estimated_final"),
        (RATES.replace("}\n  - {key: card", ", extra: 1}\n  - {key: card"), "extra"),
        (RATES + RATES.removeprefix("rates:\n"), "Duplicate rate key 'mep'"),
        (RATES.replace("quote: ARS", "quote: USD"), "base and quote must differ"),
    ],
)
def test_names_what_is_wrong(tmp_path: Path, text: str, message: str) -> None:
    with pytest.raises(ConfigError, match=message) as info:
        _load(tmp_path, text)
    assert "rates.yaml" in str(info.value)


def test_the_shipped_rates_are_the_five_the_calculator_asks_for() -> None:
    catalog = load_rate_catalog(CONFIG_DIR / "rates.yaml")
    assert [(r.key, r.base, r.quote) for r in catalog.rates] == [
        ("mep", Currency.USD, Currency.ARS),
        ("binance_p2p_usdt_usd", Currency.USDT, Currency.USD),
        ("bitso_usdt_ars", Currency.USDT, Currency.ARS),
        ("arq_usd_ars", Currency.USD, Currency.ARS),
        ("binance_card_usd_usdt", Currency.USD, Currency.USDT),
    ]
    assert [r.key for r in catalog.rates if r.estimated_final] == ["binance_card_usd_usdt"]
