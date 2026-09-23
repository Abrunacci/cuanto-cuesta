"""Routes are declared as data: an ordered list of steps.

A step may charge fees, convert currency, or both. Within a step:

1. percent fees and fixed fees in the step's input currency are deducted;
2. the conversion (if any) is applied;
3. fixed fees in the conversion's target currency are deducted.

That order lets a single step describe e.g. "buy USDT on P2P and pay the
taker fee in USDT" without extra code.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from cuanto_cuesta.domain.errors import InvalidRouteError
from cuanto_cuesta.domain.money import Currency


@dataclass(frozen=True, slots=True)
class Conversion:
    rate_key: str
    target: Currency


@dataclass(frozen=True, slots=True)
class Step:
    label: str
    fee_ids: tuple[str, ...] = ()
    conversion: Conversion | None = None


@dataclass(frozen=True, slots=True)
class Route:
    id: str
    name: str
    source: Currency
    target: Currency
    steps: tuple[Step, ...]
    warnings: tuple[str, ...] = field(default=())

    def __post_init__(self) -> None:
        if not self.steps:
            raise InvalidRouteError(f"Route {self.id!r} has no steps")
        currency = self.source
        for step in self.steps:
            if step.conversion is None and not step.fee_ids:
                raise InvalidRouteError(
                    f"Route {self.id!r}: step {step.label!r} neither charges fees nor converts"
                )
            if step.conversion is not None:
                if step.conversion.target is currency:
                    raise InvalidRouteError(
                        f"Route {self.id!r}: step {step.label!r} converts {currency} to itself"
                    )
                currency = step.conversion.target
        if currency is not self.target:
            raise InvalidRouteError(f"Route {self.id!r} ends in {currency}, expected {self.target}")

    def fee_ids(self) -> frozenset[str]:
        return frozenset(fee_id for step in self.steps for fee_id in step.fee_ids)

    def rate_keys(self) -> frozenset[str]:
        return frozenset(s.conversion.rate_key for s in self.steps if s.conversion is not None)
