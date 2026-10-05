"""A quote: the latest observed price of one of the calculator's rates, and how a newly observed
one relates to it.

There is no history. Each rate has one current quote, replaced by a newer observation; an older
one is ignored. A newer one that jumps too far from the current one is held aside instead, until
the next readings confirm it (``Held``). Which rates exist, their currencies, plausible ranges and
how far each may jump are data (``config/rates.yaml``), not domain rules.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from cuanto_cuesta.domain.percentage import HUNDRED, Percentage


@dataclass(frozen=True, slots=True)
class Quote:
    key: str
    price: Decimal
    """One unit of the rate's base currency, in its quote currency."""
    estimated_final: Decimal | None
    """For the card purchase only: the price its final payment screen is expected to show."""
    source: str
    source_url: str | None
    observed_at: datetime

    def __post_init__(self) -> None:
        _check_price("price", self.price)
        if self.estimated_final is not None:
            _check_price("estimated_final", self.estimated_final)
        if self.observed_at.utcoffset() is None:
            raise ValueError(f"observed_at must carry a time zone, got {self.observed_at}")

    def same_values(self, other: Quote) -> bool:
        """Same prices, compared as numbers: ``1452.3`` and ``1452.30`` are the same value."""
        return self.price == other.price and self.estimated_final == other.estimated_final


class Arrival(StrEnum):
    """How an observed quote relates to the current one for the same rate."""

    NEWER = "newer"
    """It replaces the current one (or there was none)."""
    SAME = "same"
    """The current one again: same time, same values."""
    OLDER = "older"
    """Observed before the current one; ignored."""
    CONFLICT = "conflict"
    """Same time as the current one, different values: one of the two is wrong."""


@dataclass(frozen=True, slots=True)
class Held:
    """A reading that jumped too far from the current quote, kept aside instead of shown.

    There is still no history: a rate holds at most one, the latest that jumped. It becomes the
    current quote only when later readings agree with it.
    """

    quote: Quote
    """The reading that jumped: later ones are compared with it."""
    confirmations: int
    """How many later readings have agreed with it so far."""
    last_seen: datetime
    """When the latest reading that counted was observed: a reading sent again counts once."""

    def __post_init__(self) -> None:
        if self.confirmations < 0:
            raise ValueError(f"confirmations must not be negative, got {self.confirmations}")
        if self.last_seen < self.quote.observed_at:
            raise ValueError("last_seen must not be before the held reading was observed")


def jumps(previous: Quote, observed: Quote, limit: Percentage) -> bool:
    """Whether a price of ``observed`` moved more than ``limit`` from the same price of
    ``previous``, relative to it. The card's estimate counts only when both readings carry one."""
    pairs = [(previous.price, observed.price)]
    if previous.estimated_final is not None and observed.estimated_final is not None:
        pairs.append((previous.estimated_final, observed.estimated_final))
    # Multiplied out instead of divided, so the comparison stays exact.
    return any(abs(new - old) * HUNDRED > limit.value * old for old, new in pairs)


def arrival(current: Quote | None, observed: Quote) -> Arrival:
    if current is None or observed.observed_at > current.observed_at:
        return Arrival.NEWER
    if observed.observed_at < current.observed_at:
        return Arrival.OLDER
    return Arrival.SAME if observed.same_values(current) else Arrival.CONFLICT


def _check_price(name: str, value: Decimal) -> None:
    if not isinstance(value, Decimal):
        raise TypeError(f"{name} must be Decimal, got {type(value).__name__}")
    if not value.is_finite() or value <= 0:
        raise ValueError(f"{name} must be positive, got {value}")
