"""The ingest contract on the wire: the envelope and its items, parsed from JSON into the
application's types. Amounts travel as decimal strings and errors as codes, never sentences.

The envelope is all or nothing (a bad one rejects the request); each item is parsed on its own,
so one that does not fit the contract becomes ``Malformed`` and the others go on.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from cuanto_cuesta.application import Malformed, RateSpec, Submission
from cuanto_cuesta.domain import Quote

MAX_ITEMS = 20
"""Five rates fit with room to spare; a bigger envelope is a bug on the sending side."""

MAX_URL_LENGTH = 2048

_Short = Annotated[str, Field(min_length=1, max_length=64)]


class _Model(BaseModel):
    # strict: a price sent as a JSON number, or a key as a list, does not fit the contract
    # instead of being coerced into it.
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Envelope(_Model):
    batch_id: Annotated[str, Field(max_length=64)]
    rates: Annotated[list[object], Field(max_length=MAX_ITEMS)]

    def batch_uuid(self) -> UUID | None:
        try:
            return UUID(self.batch_id)
        except ValueError:
            return None


class _Item(_Model):
    key: _Short
    base: _Short
    quote: _Short
    price: _Short
    estimated_final: _Short | None = None
    source: Annotated[str, Field(pattern=r"^[a-z0-9_]{1,64}$")]
    source_url: Annotated[str, Field(max_length=MAX_URL_LENGTH)] | None = None
    observed_at: _Short


def parse_envelope(data: object) -> tuple[UUID, list[object]] | None:
    try:
        envelope = Envelope.model_validate(data)
    except ValidationError:
        return None
    batch_id = envelope.batch_uuid()
    return None if batch_id is None else (batch_id, envelope.rates)


def parse_item(data: object) -> Submission | Malformed:
    try:
        item = _Item.model_validate(data)
    except ValidationError:
        return Malformed(_key_of(data))
    observed_at = _timestamp(item.observed_at)
    if observed_at is None or (item.source_url is not None and not _https(item.source_url)):
        return Malformed(item.key)
    return Submission(
        key=item.key,
        base=item.base,
        quote=item.quote,
        price=item.price,
        estimated_final=item.estimated_final,
        sent_estimated_final="estimated_final" in item.model_fields_set,
        source=item.source,
        source_url=item.source_url,
        observed_at=observed_at,
    )


def quote_json(spec: RateSpec, quote: Quote) -> dict[str, object]:
    data: dict[str, object] = {
        "key": spec.key,
        "base": str(spec.base),
        "quote": str(spec.quote),
        "price": decimal_text(quote.price),
    }
    if spec.estimated_final:
        estimated = quote.estimated_final
        data["estimated_final"] = None if estimated is None else decimal_text(estimated)
    data |= {
        "source": quote.source,
        "source_url": quote.source_url,
        "observed_at": timestamp_text(quote.observed_at),
    }
    return data


def decimal_text(value: Decimal) -> str:
    """Plain notation, never an exponent: ``1E+3`` would not parse on the other side."""
    return format(value, "f")


def timestamp_text(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _timestamp(text: str) -> datetime | None:
    """RFC 3339: a date and a time, with a zone. ``2026-10-01`` or a naive time does not fit."""
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    return moment if "T" in text.upper() and moment.utcoffset() is not None else None


def _https(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return parts.scheme == "https" and bool(parts.hostname)


def _key_of(data: object) -> str | None:
    """The item's key, if it has a usable one, so the response can say which item failed."""
    if isinstance(data, dict):
        key = data.get("key")
        if isinstance(key, str) and 0 < len(key) <= 64:
            return key
    return None
