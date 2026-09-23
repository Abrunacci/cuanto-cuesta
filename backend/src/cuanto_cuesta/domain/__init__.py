"""Pure domain: money, fees, rates, routes and their calculation. No I/O, no frameworks."""

from cuanto_cuesta.domain.calculation import ChargedFee, RouteResult, StepResult, run_route
from cuanto_cuesta.domain.errors import (
    CurrencyMismatchError,
    DomainError,
    InvalidRouteError,
    UnknownFeeError,
    UnknownRateError,
)
from cuanto_cuesta.domain.fees import Fee, FeeKind
from cuanto_cuesta.domain.money import Currency, Money
from cuanto_cuesta.domain.rates import Rate
from cuanto_cuesta.domain.routes import Conversion, Route, Step

__all__ = [
    "ChargedFee",
    "Conversion",
    "Currency",
    "CurrencyMismatchError",
    "DomainError",
    "Fee",
    "FeeKind",
    "InvalidRouteError",
    "Money",
    "Rate",
    "Route",
    "RouteResult",
    "Step",
    "StepResult",
    "UnknownFeeError",
    "UnknownRateError",
    "run_route",
]
