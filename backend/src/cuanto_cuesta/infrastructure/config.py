"""Load ``fees.yaml`` and ``routes.yaml`` into a ``Catalog``.

Each file is checked against a pydantic schema; ``Catalog`` then checks that they fit together.
Every failure surfaces as a ``ConfigError`` that names the file and the offending field.

YAML floats are read as ``Decimal`` from their source text, so ``0.6`` is exactly 0.6.
"""

from __future__ import annotations

from collections.abc import Hashable
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Annotated, Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError

from cuanto_cuesta.application import Catalog, FeeDefault, FeeStatus, InvalidCatalogError
from cuanto_cuesta.domain import (
    Conversion,
    Currency,
    DomainError,
    Fee,
    FixedFee,
    Money,
    Percentage,
    PercentFee,
    Route,
    Step,
)


class ConfigError(Exception):
    """A config file is missing, malformed, or does not fit the other one."""


def load_catalog(fees_path: Path, routes_path: Path) -> Catalog:
    fees = _parse(fees_path, _FeesFile)
    routes = _parse(routes_path, _RoutesFile)
    try:
        catalog_routes = tuple(r.to_domain() for r in routes.routes)
    except DomainError as exc:
        raise ConfigError(f"{routes_path}: {exc}") from exc
    try:
        return Catalog(tuple(_fee_default(f) for f in fees.fees), catalog_routes)
    except InvalidCatalogError as exc:
        raise ConfigError(f"{fees_path} and {routes_path}: {exc}") from exc


# --- YAML --------------------------------------------------------------------------------------


class _DecimalLoader(yaml.SafeLoader):
    """Safe loader that reads floats as Decimal and rejects duplicate keys."""


def _construct_decimal(loader: yaml.SafeLoader, node: yaml.ScalarNode) -> Decimal:
    text = loader.construct_scalar(node)
    try:
        return Decimal(text)
    except InvalidOperation:
        raise yaml.constructor.ConstructorError(
            None, None, f"cannot read {text!r} as a decimal number", node.start_mark
        ) from None


def _construct_mapping(loader: yaml.SafeLoader, node: yaml.MappingNode) -> dict[Any, Any]:
    seen: set[Any] = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node)
        if not isinstance(key, Hashable):
            continue  # construct_mapping reports it as "found unhashable key"
        if key in seen:
            raise yaml.constructor.ConstructorError(
                None, None, f"duplicate key {key!r}", key_node.start_mark
            )
        seen.add(key)
    return loader.construct_mapping(node)


_DecimalLoader.add_constructor("tag:yaml.org,2002:float", _construct_decimal)
_DecimalLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def _parse[T: BaseModel](path: Path, schema: type[T]) -> T:
    try:
        data = yaml.load(path.read_text(encoding="utf-8"), Loader=_DecimalLoader)
        return schema.model_validate(data)
    except OSError as exc:
        raise ConfigError(f"{path}: cannot read: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise ConfigError(f"{path}: not UTF-8: {exc}") from exc
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path}: invalid YAML: {exc}") from exc
    except ValidationError as exc:
        raise ConfigError(f"{path}: {_describe(exc)}") from exc


def _describe(exc: ValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(part) for part in error['loc']) or '(root)'}: {error['msg']}"
        for error in exc.errors()
    )


# --- Schemas -----------------------------------------------------------------------------------

_Id = Annotated[str, Field(pattern=r"^[a-z0-9]+(_[a-z0-9]+)*$")]
_Text = Annotated[str, Field(min_length=1)]
_NonNegative = Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]


class _Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class _MoneySpec(_Schema):
    amount: _NonNegative
    currency: Currency

    def to_domain(self) -> Money:
        return Money(self.amount, self.currency)


class _FeeSpec(_Schema):
    id: _Id
    label: _Text
    source_url: HttpUrl
    verified_at: date
    status: FeeStatus
    upper_bound: bool = False
    note: _Text | None = None


class _FixedFeeSpec(_FeeSpec):
    kind: Literal["fixed"]
    value: _NonNegative
    currency: Currency


class _PercentFeeSpec(_FeeSpec):
    kind: Literal["percent"]
    value: Annotated[_NonNegative, Field(le=100)]
    minimum: _MoneySpec | None = None


class _FeesFile(_Schema):
    fees: list[Annotated[_FixedFeeSpec | _PercentFeeSpec, Field(discriminator="kind")]]


def _fee_default(spec: _FixedFeeSpec | _PercentFeeSpec) -> FeeDefault:
    fee: Fee
    match spec:
        case _FixedFeeSpec(value=value, currency=currency):
            fee = FixedFee(spec.id, Money(value, currency))
        case _PercentFeeSpec(value=value, minimum=minimum):
            fee = PercentFee(
                spec.id,
                Percentage(value),
                minimum.to_domain() if minimum is not None else None,
            )
    return FeeDefault(
        fee=fee,
        label=spec.label,
        source_url=str(spec.source_url),
        verified_at=spec.verified_at,
        status=spec.status,
        upper_bound=spec.upper_bound,
        note=spec.note,
    )


class _ConversionSpec(_Schema):
    rate: _Id
    to: Currency


class _StepSpec(_Schema):
    label: _Text
    fees: list[_Id] = []
    conversion: _ConversionSpec | None = None

    def to_domain(self) -> Step:
        conversion = (
            Conversion(self.conversion.rate, self.conversion.to)
            if self.conversion is not None
            else None
        )
        return Step(self.label, tuple(self.fees), conversion)


class _RouteSpec(_Schema):
    id: _Id
    name: _Text
    source: Currency
    target: Currency
    steps: list[_StepSpec]
    warnings: list[_Text] = []

    def to_domain(self) -> Route:
        return Route(
            self.id,
            self.name,
            self.source,
            self.target,
            tuple(s.to_domain() for s in self.steps),
            tuple(self.warnings),
        )


class _RoutesFile(_Schema):
    routes: list[_RouteSpec]
