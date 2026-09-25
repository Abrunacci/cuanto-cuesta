"""The researched fee defaults, checked as a whole when the catalog is built: no fee id twice,
and every value within the caps. The routes that use them live in the calculator.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from cuanto_cuesta.application.limits import fee_problems
from cuanto_cuesta.domain import Fee


class InvalidCatalogError(Exception):
    """The fee defaults are inconsistent: a repeated id or a value above its cap."""


@dataclass(frozen=True, slots=True)
class Verified:
    """The source states this value."""

    source_url: str
    verified_at: date


@dataclass(frozen=True, slots=True)
class Estimate:
    """The source does not confirm this value (a cap, a range or a contradiction)."""

    source_url: str
    verified_at: date
    upper_bound: bool = False
    """The source only gives a cap ("up to X"); the default is that cap."""


@dataclass(frozen=True, slots=True)
class UserDefined:
    """No source can give this value; the user sets it and the default is neutral."""

    reference_url: str
    """The reference price the fee applies to, not a source for the value."""
    checked_at: date


type Provenance = Verified | Estimate | UserDefined


@dataclass(frozen=True, slots=True)
class FeeDefault:
    """A fee as shipped in ``fees.yaml``, with where its value comes from."""

    fee: Fee
    label: str
    provenance: Provenance
    note: str | None = None

    @property
    def id(self) -> str:
        return self.fee.id


@dataclass(frozen=True, slots=True)
class Catalog:
    fees: tuple[FeeDefault, ...]

    def __post_init__(self) -> None:
        problems = [
            *_duplicates("fee", [d.id for d in self.fees]),
            *(f"Fee {d.id!r}: {p}" for d in self.fees for p in fee_problems(d.fee)),
        ]
        if problems:
            raise InvalidCatalogError("; ".join(problems))

    def default_fees(self) -> dict[str, Fee]:
        return {d.id: d.fee for d in self.fees}


def _duplicates(what: str, ids: list[str]) -> list[str]:
    return [f"Duplicate {what} id {i!r}" for i in sorted({i for i in ids if ids.count(i) > 1})]
