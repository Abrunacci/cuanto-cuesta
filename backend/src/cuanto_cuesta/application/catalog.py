"""The fee defaults and routes the app runs with, checked as a whole.

Each file on its own can be well formed and still not fit the other: a route may name a fee
that does not exist, or a fixed fee may sit in a currency the step never holds. ``Catalog``
checks all of that once, when it is built, so a broken config fails at startup instead of on
a request.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from cuanto_cuesta.application.limits import fee_problems
from cuanto_cuesta.domain import DomainError, Fee, Money, Rate, Route, run_route


class InvalidCatalogError(Exception):
    """The fees and routes do not fit together."""


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
    routes: tuple[Route, ...]

    def __post_init__(self) -> None:
        problems = [
            *_duplicates("fee", [d.id for d in self.fees]),
            *_duplicates("route", [r.id for r in self.routes]),
            *(f"Fee {d.id!r}: {p}" for d in self.fees for p in fee_problems(d.fee)),
            *self._reference_problems(),
        ]
        if not problems:
            problems = self._run_problems()
        if problems:
            raise InvalidCatalogError("; ".join(problems))

    def default_fees(self) -> dict[str, Fee]:
        return {d.id: d.fee for d in self.fees}

    def _reference_problems(self) -> list[str]:
        known = {d.id for d in self.fees}
        used = {fee_id for route in self.routes for fee_id in route.fee_ids()}
        return [
            *(
                f"Route {route.id!r} uses unknown fee {fee_id!r}"
                for route in self.routes
                for fee_id in sorted(route.fee_ids() - known)
            ),
            *(f"Fee {fee_id!r} is not used by any route" for fee_id in sorted(known - used)),
        ]

    def _run_problems(self) -> list[str]:
        """Run every route once so the domain reports fees in the wrong currency.

        The rates are placeholders at 1: only the currencies matter here, and the domain
        already knows which currency each fee must be in at each step.
        """
        fees = self.default_fees()
        problems: list[str] = []
        for route in self.routes:
            try:
                run_route(route, Money(Decimal(1000), route.source), fees, _unit_rates(route))
            except DomainError as exc:
                problems.append(str(exc))
        return problems


def _unit_rates(route: Route) -> Mapping[str, Rate]:
    rates: dict[str, Rate] = {}
    currency = route.source
    for step in route.steps:
        if step.conversion is None:
            continue
        key, target = step.conversion.rate_key, step.conversion.target
        rates.setdefault(key, Rate(key, currency, target, Decimal(1), Decimal(1)))
        currency = target
    return rates


def _duplicates(what: str, ids: list[str]) -> list[str]:
    return [f"Duplicate {what} id {i!r}" for i in sorted({i for i in ids if ids.count(i) > 1})]
