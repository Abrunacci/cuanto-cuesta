"""Store the quotes data-pipeline sends, one item at a time, and read the current ones.

Each item is judged on its own: an invalid one is rejected with an error code and the others are
still stored. The checks run in a fixed order, so an item gets the first code that applies.

A valid reading that jumps too far from the current quote is not shown: it is held aside and
answered as rejected (``jump``). It becomes the current quote only when the next
``CONFIRMATIONS`` readings agree with it; a reading back near the current quote discards it.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from cuanto_cuesta.application.rates import RateCatalog, RateSpec
from cuanto_cuesta.domain import Arrival, Held, Quote, arrival, jumps

MAX_CLOCK_SKEW = timedelta(minutes=5)
"""How far in the future an observation may be dated: the two servers' clocks can drift."""

CONFIRMATIONS = 2
"""How many later readings must agree with a held jump before it replaces the current quote. A
broken source tends to fail once; a market that really moved keeps reading the new price."""

_PRICE = re.compile(r"^[0-9]+(\.[0-9]{1,10})?$")
"""A plain decimal with up to 10 places: no sign, exponent, spaces or thousands separators."""


class Status(StrEnum):
    STORED = "stored"
    UNCHANGED = "unchanged"
    OLDER = "older"
    REJECTED = "rejected"


class Rejection(StrEnum):
    INVALID_ITEM = "invalid_item"
    UNKNOWN_KEY = "unknown_key"
    CURRENCY_MISMATCH = "currency_mismatch"
    UNEXPECTED_FIELD = "unexpected_field"
    INVALID_PRICE = "invalid_price"
    OUT_OF_RANGE = "out_of_range"
    FUTURE_OBSERVED_AT = "future_observed_at"
    CONFLICT = "conflict"
    JUMP = "jump"


class JumpEvent(StrEnum):
    HELD = "held"
    """The reading jumped: it is held aside, replacing any reading held before."""
    CONFIRMING = "confirming"
    """The reading agrees with the held one, which still needs more confirmations."""
    CONFIRMED = "confirmed"
    """Enough readings agreed: the reading replaced the current quote."""
    DISCARDED = "discarded"
    """The reading is back near the current quote: it was stored and the held one dropped."""


@dataclass(frozen=True, slots=True)
class Jump:
    """What a reading did to a held jump, with the prices that tell why."""

    event: JumpEvent
    current: Quote
    """The current quote before this reading."""
    held: Quote
    """The held reading."""
    observed: Quote
    """This reading."""
    confirmations: int = 0


@dataclass(frozen=True, slots=True)
class Submission:
    """An item whose fields have the right types; its values are not checked yet."""

    key: str
    base: str
    quote: str
    price: str
    estimated_final: str | None
    sent_estimated_final: bool
    """Whether the item has the field at all: ``null`` is not the same as leaving it out."""
    source: str
    source_url: str | None
    observed_at: datetime


@dataclass(frozen=True, slots=True)
class Malformed:
    """An item that does not even have the contract's shape (a missing field, a wrong type)."""

    key: str | None


@dataclass(frozen=True, slots=True)
class ItemResult:
    index: int
    key: str | None
    status: Status
    error: Rejection | None = None
    jump: Jump | None = None


class QuoteStore(Protocol):
    """Where the current quotes live. One instance is one transaction."""

    def lock_for_ingest(self) -> None:
        """Hold off other ingests until this transaction ends, so each one compares with what
        the previous one stored."""

    def current(self, key: str) -> Quote | None: ...

    def held(self, key: str) -> Held | None: ...

    def save(self, quote: Quote, *, batch_id: UUID, received_at: datetime) -> None:
        """Make ``quote`` the current one for its key, dropping any held reading."""

    def hold(self, key: str, held: Held) -> None:
        """Keep ``held`` aside for ``key``, which already has a current quote."""

    def all(self) -> list[tuple[Quote, Held | None]]: ...


def ingest(
    catalog: RateCatalog,
    store: QuoteStore,
    batch_id: UUID,
    items: Sequence[Submission | Malformed],
    now: datetime,
) -> list[ItemResult]:
    store.lock_for_ingest()
    results = []
    for index, item in enumerate(items):
        match item:
            case Malformed(key=key):
                result = ItemResult(index, key, Status.REJECTED, Rejection.INVALID_ITEM)
            case Submission():
                result = _ingest_one(catalog, store, batch_id, index, item, now)
        results.append(result)
    return results


def current_quotes(
    catalog: RateCatalog, store: QuoteStore
) -> list[tuple[RateSpec, Quote, Held | None]]:
    """The current quote of every rate that has one, with its held reading if there is one, in
    the catalog's order."""
    stored = {quote.key: (quote, held) for quote, held in store.all()}
    return [(spec, *stored[spec.key]) for spec in catalog.rates if spec.key in stored]


def _ingest_one(
    catalog: RateCatalog,
    store: QuoteStore,
    batch_id: UUID,
    index: int,
    item: Submission,
    now: datetime,
) -> ItemResult:
    def rejected(error: Rejection) -> ItemResult:
        return ItemResult(index, item.key, Status.REJECTED, error)

    spec = catalog.get(item.key)
    if spec is None:
        return rejected(Rejection.UNKNOWN_KEY)
    checked = _check(spec, item, now)
    if isinstance(checked, Rejection):
        return rejected(checked)
    current = store.current(item.key)
    match arrival(current, checked):
        case Arrival.NEWER if current is not None and jumps(current, checked, spec.max_jump):
            return _jumped(store, index, current, checked, batch_id=batch_id, now=now, spec=spec)
        case Arrival.NEWER:
            held = None if current is None else store.held(item.key)
            store.save(checked, batch_id=batch_id, received_at=now)
            if current is None or held is None:
                return ItemResult(index, item.key, Status.STORED)
            discarded = Jump(JumpEvent.DISCARDED, current, held.quote, checked)
            return ItemResult(index, item.key, Status.STORED, jump=discarded)
        case Arrival.SAME:
            return ItemResult(index, item.key, Status.UNCHANGED)
        case Arrival.OLDER:
            return ItemResult(index, item.key, Status.OLDER)
        case Arrival.CONFLICT:
            return rejected(Rejection.CONFLICT)


def _jumped(
    store: QuoteStore,
    index: int,
    current: Quote,
    observed: Quote,
    *,
    batch_id: UUID,
    now: datetime,
    spec: RateSpec,
) -> ItemResult:
    """A newer reading that jumped from ``current``: hold it, count it towards the held one, or,
    with enough confirmations, make it the current quote."""
    key = observed.key
    held = store.held(key)

    def result(status: Status, event: JumpEvent | None, reference: Quote, n: int) -> ItemResult:
        error = None if status is Status.STORED else Rejection.JUMP
        jump = None if event is None else Jump(event, current, reference, observed, n)
        return ItemResult(index, key, status, error, jump)

    if held is not None and not jumps(held.quote, observed, spec.max_jump):
        if observed.observed_at <= held.last_seen:  # sent again: it already counted
            return result(Status.REJECTED, None, held.quote, held.confirmations)
        confirmations = held.confirmations + 1
        if confirmations >= CONFIRMATIONS:
            store.save(observed, batch_id=batch_id, received_at=now)
            return result(Status.STORED, JumpEvent.CONFIRMED, held.quote, confirmations)
        store.hold(key, Held(held.quote, confirmations, observed.observed_at))
        return result(Status.REJECTED, JumpEvent.CONFIRMING, held.quote, confirmations)
    store.hold(key, Held(observed, 0, observed.observed_at))
    return result(Status.REJECTED, JumpEvent.HELD, observed, 0)


def _check(spec: RateSpec, item: Submission, now: datetime) -> Quote | Rejection:
    if (item.base, item.quote) != (spec.base, spec.quote):
        return Rejection.CURRENCY_MISMATCH
    if item.sent_estimated_final and not spec.estimated_final:
        return Rejection.UNEXPECTED_FIELD
    if spec.estimated_final and not item.sent_estimated_final:
        return Rejection.INVALID_ITEM
    price = _price(item.price)
    estimated_final = None if item.estimated_final is None else _price(item.estimated_final)
    if price is None or (item.estimated_final is not None and estimated_final is None):
        return Rejection.INVALID_PRICE
    if not all(spec.in_range(p) for p in (price, estimated_final) if p is not None):
        return Rejection.OUT_OF_RANGE
    if item.observed_at > now + MAX_CLOCK_SKEW:
        return Rejection.FUTURE_OBSERVED_AT
    return Quote(
        key=item.key,
        price=price,
        estimated_final=estimated_final,
        source=item.source,
        source_url=item.source_url,
        observed_at=item.observed_at,
    )


def _price(text: str) -> Decimal | None:
    if _PRICE.fullmatch(text) is None:
        return None
    value = Decimal(text)
    return value if value > 0 else None
