"""Use cases, the fee catalog and override validation. Depends only on the domain."""

from cuanto_cuesta.application.catalog import (
    Catalog,
    Estimate,
    FeeDefault,
    InvalidCatalogError,
    Provenance,
    UserDefined,
    Verified,
)
from cuanto_cuesta.application.limits import MAX_PERCENT, max_fixed
from cuanto_cuesta.application.overrides import (
    InvalidOverridesError,
    OverrideField,
    OverrideProblem,
    apply_overrides,
)

__all__ = [
    "MAX_PERCENT",
    "Catalog",
    "Estimate",
    "FeeDefault",
    "InvalidCatalogError",
    "InvalidOverridesError",
    "OverrideField",
    "OverrideProblem",
    "Provenance",
    "UserDefined",
    "Verified",
    "apply_overrides",
    "max_fixed",
]
