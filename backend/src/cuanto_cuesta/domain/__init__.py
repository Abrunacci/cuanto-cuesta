"""Pure domain: money, fees, rates, routes and their calculation. No I/O, no frameworks."""

from cuanto_cuesta.domain.calculation import ChargedFee, RouteResult, StepResult, run_route
from cuanto_cuesta.domain.comparison import Comparison, RouteComparison, compare_routes
from cuanto_cuesta.domain.errors import (
    CurrencyMismatchError,
    DomainError,
    InvalidRouteError,
    UnknownFeeError,
    UnknownRateError,
)
from cuanto_cuesta.domain.fees import Fee, FixedFee, PercentFee, charge, without_charge
from cuanto_cuesta.domain.money import Currency, Money
from cuanto_cuesta.domain.percentage import Percentage
from cuanto_cuesta.domain.rates import Rate
from cuanto_cuesta.domain.routes import Conversion, Route, Step

__all__ = [
    "ChargedFee",
    "Comparison",
    "Conversion",
    "Currency",
    "CurrencyMismatchError",
    "DomainError",
    "Fee",
    "FixedFee",
    "InvalidRouteError",
    "Money",
    "PercentFee",
    "Percentage",
    "Rate",
    "Route",
    "RouteComparison",
    "RouteResult",
    "Step",
    "StepResult",
    "UnknownFeeError",
    "UnknownRateError",
    "charge",
    "compare_routes",
    "run_route",
    "without_charge",
]
