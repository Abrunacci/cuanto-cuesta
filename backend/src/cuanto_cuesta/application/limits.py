"""The caps on fee values, for defaults and user overrides alike.

They reject typos and nonsense (a 90 % fee, a 5000 USD fixed fee), not unusual but real fees:
every default in ``fees.yaml`` sits far below them.
"""

from __future__ import annotations

from decimal import Decimal

from cuanto_cuesta.domain import Currency, Fee, FixedFee, PercentFee

MAX_PERCENT = Decimal(20)


def max_fixed(currency: Currency) -> Decimal:
    """The cap on a fixed fee or a percent fee minimum in ``currency``."""
    match currency:
        case Currency.USD | Currency.USDT | Currency.USDC:
            return Decimal(100)
        case Currency.ARS:
            return Decimal(150_000)


def value_problem(value: Decimal, cap: Decimal) -> str | None:
    """Why ``value`` is not an acceptable fee value, or None if it is."""
    if not value.is_finite():
        return f"must be a finite number, got {value}"
    if value < 0:
        return f"must not be negative, got {value}"
    if value > cap:
        return f"must be at most {cap}, got {value}"
    return None


def fee_problems(fee: Fee) -> list[str]:
    """Why an already built fee is outside the caps, if it is."""
    match fee:
        case FixedFee(amount=amount):
            checks = [("value", amount.amount, max_fixed(amount.currency))]
        case PercentFee(rate=rate, minimum=minimum):
            checks = [("value", rate.value, MAX_PERCENT)]
            if minimum is not None:
                checks.append(("minimum", minimum.amount, max_fixed(minimum.currency)))
    return [
        f"{field} {problem}"
        for field, value, cap in checks
        if (problem := value_problem(value, cap)) is not None
    ]
