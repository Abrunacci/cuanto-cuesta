"""Use cases, the fee catalog and override validation. Depends only on the domain."""

from cuanto_cuesta.application.catalog import Catalog, FeeDefault, FeeStatus, InvalidCatalogError
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
    "FeeDefault",
    "FeeStatus",
    "InvalidCatalogError",
    "InvalidOverridesError",
    "OverrideField",
    "OverrideProblem",
    "apply_overrides",
    "max_fixed",
]
