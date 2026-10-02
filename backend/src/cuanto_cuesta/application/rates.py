"""The rates the calculator asks for: which currencies each one quotes and the range its price
can plausibly be in. Loaded from ``config/rates.yaml``; the calculator keeps the same ranges in
``frontend/src/form/plausible.ts`` (a parity test keeps them equal).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from cuanto_cuesta.domain import Currency


class InvalidRateCatalogError(Exception):
    """The rate definitions are inconsistent: a repeated key, a pair or a range that cannot be."""


@dataclass(frozen=True, slots=True)
class RateSpec:
    key: str
    base: Currency
    quote: Currency
    minimum: Decimal
    maximum: Decimal
    estimated_final: bool
    """The rate also carries the price its final payment screen is expected to show."""

    def in_range(self, price: Decimal) -> bool:
        return self.minimum <= price <= self.maximum

    def problems(self) -> list[str]:
        problems = []
        if self.base == self.quote:
            problems.append("base and quote must differ")
        if not 0 < self.minimum < self.maximum:
            problems.append(f"invalid range {self.minimum}..{self.maximum}")
        return problems


@dataclass(frozen=True, slots=True)
class RateCatalog:
    rates: tuple[RateSpec, ...]

    def __post_init__(self) -> None:
        keys = [r.key for r in self.rates]
        problems = [
            *(f"Duplicate rate key {k!r}" for k in sorted({k for k in keys if keys.count(k) > 1})),
            *(f"Rate {r.key!r}: {p}" for r in self.rates for p in r.problems()),
        ]
        if problems:
            raise InvalidRateCatalogError("; ".join(problems))

    def get(self, key: str) -> RateSpec | None:
        return next((r for r in self.rates if r.key == key), None)
