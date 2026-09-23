"""User overrides of the fee defaults, validated before they reach the domain.

Two separate mappings, both keyed by fee id:

* ``values``: the fee's main value, an amount for a fixed fee and a percentage for a percent fee.
* ``minimums``: the minimum of a percent fee, only for fees that have one by default.

Every problem is collected and reported at once, so a form can flag all of its fields.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from cuanto_cuesta.application.catalog import Catalog
from cuanto_cuesta.application.limits import MAX_PERCENT, max_fixed, value_problem
from cuanto_cuesta.domain import Fee, FixedFee, Money, Percentage, PercentFee


class OverrideField(StrEnum):
    VALUE = "value"
    MINIMUM = "minimum"


@dataclass(frozen=True, slots=True)
class OverrideProblem:
    fee_id: str
    field: OverrideField
    message: str


class InvalidOverridesError(Exception):
    def __init__(self, problems: tuple[OverrideProblem, ...]) -> None:
        super().__init__("; ".join(f"{p.fee_id}.{p.field}: {p.message}" for p in problems))
        self.problems = problems


def apply_overrides(
    catalog: Catalog,
    values: Mapping[str, Decimal],
    minimums: Mapping[str, Decimal],
) -> dict[str, Fee]:
    """The catalog's default fees with the user's overrides applied."""
    fees = catalog.default_fees()
    problems = [
        *_problems(fees, values, OverrideField.VALUE),
        *_problems(fees, minimums, OverrideField.MINIMUM),
    ]
    if problems:
        raise InvalidOverridesError(tuple(problems))
    for fee_id in values.keys() | minimums.keys():
        fees[fee_id] = _overridden(fees[fee_id], values.get(fee_id), minimums.get(fee_id))
    return fees


def _problems(
    fees: Mapping[str, Fee], overrides: Mapping[str, Decimal], field: OverrideField
) -> list[OverrideProblem]:
    problems: list[OverrideProblem] = []
    for fee_id, value in sorted(overrides.items()):
        fee = fees.get(fee_id)
        if fee is None:
            message: str | None = "unknown fee"
        else:
            cap = _cap(fee, field)
            message = "this fee has no minimum" if cap is None else value_problem(value, cap)
        if message is not None:
            problems.append(OverrideProblem(fee_id, field, message))
    return problems


def _cap(fee: Fee, field: OverrideField) -> Decimal | None:
    """The cap for ``field`` of ``fee``, or None if the fee has no such field."""
    match field:
        case OverrideField.VALUE:
            match fee:
                case FixedFee(amount=amount):
                    return max_fixed(amount.currency)
                case PercentFee():
                    return MAX_PERCENT
        case OverrideField.MINIMUM:
            match fee:
                case PercentFee(minimum=Money(currency=currency)):
                    return max_fixed(currency)
                case FixedFee() | PercentFee():
                    return None


def _overridden(fee: Fee, value: Decimal | None, minimum: Decimal | None) -> Fee:
    match fee:
        case FixedFee(id=fee_id, amount=amount):
            return FixedFee(fee_id, amount if value is None else Money(value, amount.currency))
        case PercentFee(id=fee_id, rate=rate, minimum=default_minimum):
            return PercentFee(
                fee_id,
                rate if value is None else Percentage(value),
                default_minimum
                if minimum is None or default_minimum is None
                else Money(minimum, default_minimum.currency),
            )
