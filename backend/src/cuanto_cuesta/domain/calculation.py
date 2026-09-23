from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from cuanto_cuesta.domain.errors import CurrencyMismatchError, UnknownFeeError, UnknownRateError
from cuanto_cuesta.domain.fees import Fee, FeeKind
from cuanto_cuesta.domain.money import Money
from cuanto_cuesta.domain.rates import Rate
from cuanto_cuesta.domain.routes import Route, Step


@dataclass(frozen=True, slots=True)
class ChargedFee:
    fee: Fee
    amount: Money


@dataclass(frozen=True, slots=True)
class StepResult:
    step: Step
    amount_in: Money
    fees: tuple[ChargedFee, ...]
    rate: Rate | None
    amount_out: Money


@dataclass(frozen=True, slots=True)
class RouteResult:
    route: Route
    steps: tuple[StepResult, ...]
    final: Money
    exhausted: bool
    """True when fees consumed the whole amount at some step."""


def run_route(
    route: Route,
    amount: Money,
    fees: Mapping[str, Fee],
    rates: Mapping[str, Rate],
) -> RouteResult:
    if amount.currency is not route.source:
        raise CurrencyMismatchError(
            f"Route {route.id!r} starts in {route.source}, got {amount.currency}"
        )
    current = amount
    exhausted = False
    results: list[StepResult] = []
    for step in route.steps:
        result, step_exhausted = _run_step(step, current, fees, rates)
        exhausted = exhausted or step_exhausted
        results.append(result)
        current = result.amount_out
    return RouteResult(route, tuple(results), current, exhausted)


def _run_step(
    step: Step,
    amount_in: Money,
    fees: Mapping[str, Fee],
    rates: Mapping[str, Rate],
) -> tuple[StepResult, bool]:
    step_fees = tuple(_lookup_fee(fees, fee_id) for fee_id in step.fee_ids)
    target = step.conversion.target if step.conversion is not None else amount_in.currency

    before: list[Fee] = []
    after: list[Fee] = []
    for fee in step_fees:
        if fee.kind is FeeKind.PERCENT or fee.currency is amount_in.currency:
            before.append(fee)
        elif fee.currency is target:
            after.append(fee)
        else:
            raise CurrencyMismatchError(
                f"Step {step.label!r}: fee {fee.id!r} is in {fee.currency}, "
                f"expected {amount_in.currency} or {target}"
            )

    charged: list[ChargedFee] = []
    exhausted = False
    current = amount_in
    for fee in before:
        charge = fee.charge_on(amount_in)
        charged.append(ChargedFee(fee, charge))
        current -= charge
    current, exhausted = _clamp(current, exhausted)

    rate: Rate | None = None
    if step.conversion is not None:
        rate = _lookup_rate(rates, step.conversion.rate_key)
        current = rate.convert(current, step.conversion.target)

    for fee in after:
        charge = fee.charge_on(current)
        charged.append(ChargedFee(fee, charge))
        current -= charge
    current, exhausted = _clamp(current, exhausted)

    return StepResult(step, amount_in, tuple(charged), rate, current.rounded_down()), exhausted


def _clamp(amount: Money, exhausted: bool) -> tuple[Money, bool]:
    if amount.is_negative():
        return Money.zero(amount.currency), True
    return amount, exhausted


def _lookup_fee(fees: Mapping[str, Fee], fee_id: str) -> Fee:
    try:
        return fees[fee_id]
    except KeyError:
        raise UnknownFeeError(f"Fee {fee_id!r} was not provided") from None


def _lookup_rate(rates: Mapping[str, Rate], key: str) -> Rate:
    try:
        return rates[key]
    except KeyError:
        raise UnknownRateError(f"Rate {key!r} was not provided") from None
