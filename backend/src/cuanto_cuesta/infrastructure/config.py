"""Load ``fees.yaml`` into a ``Catalog``.

The file is checked against a pydantic schema; ``Catalog`` then checks the fees as a whole.
Every failure surfaces as a ``ConfigError`` that names the file and the offending field.

YAML floats are read as ``Decimal`` from their source text, so ``0.6`` is exactly 0.6.
"""

from __future__ import annotations

from collections.abc import Hashable
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Annotated, Any, Literal, Self

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StrictBool,
    ValidationError,
    model_validator,
)

from cuanto_cuesta.application import (
    Catalog,
    Estimate,
    FeeDefault,
    InvalidCatalogError,
    Provenance,
    UserDefined,
    Verified,
)
from cuanto_cuesta.domain import (
    Currency,
    Fee,
    FixedFee,
    Money,
    Percentage,
    PercentFee,
)


class ConfigError(Exception):
    """The config file is missing, malformed, or its fees are inconsistent."""


def load_catalog(fees_path: Path) -> Catalog:
    fees = _parse(fees_path, _FeesFile)
    try:
        return Catalog(tuple(_fee_default(f) for f in fees.fees))
    except InvalidCatalogError as exc:
        raise ConfigError(f"{fees_path}: {exc}") from exc


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
    status: Literal["verified", "pending", "user_defined"]
    source_url: HttpUrl
    verified_at: date
    upper_bound: StrictBool = False
    note: _Text | None = None

    def _check_provenance(self, *, neutral: bool) -> None:
        """Reject the fields that do not fit the fee's status."""
        if "upper_bound" in self.model_fields_set and self.status != "pending":
            raise ValueError("upper_bound: only a pending fee can be an upper bound")
        if self.status == "user_defined" and not neutral:
            raise ValueError("a user_defined fee must default to 0, with no minimum")


class _FixedFeeSpec(_FeeSpec):
    kind: Literal["fixed"]
    value: _NonNegative
    currency: Currency

    @model_validator(mode="after")
    def _provenance_fits(self) -> Self:
        self._check_provenance(neutral=self.value == 0)
        return self


class _PercentFeeSpec(_FeeSpec):
    kind: Literal["percent"]
    value: Annotated[_NonNegative, Field(le=100)]
    minimum: _MoneySpec | None = None

    @model_validator(mode="after")
    def _provenance_fits(self) -> Self:
        self._check_provenance(neutral=self.value == 0 and self.minimum is None)
        return self


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
    return FeeDefault(fee=fee, label=spec.label, provenance=_provenance(spec), note=spec.note)


def _provenance(spec: _FeeSpec) -> Provenance:
    url = str(spec.source_url)
    match spec.status:
        case "verified":
            return Verified(url, spec.verified_at)
        case "pending":
            return Estimate(url, spec.verified_at, upper_bound=spec.upper_bound)
        case "user_defined":
            return UserDefined(url, spec.verified_at)
