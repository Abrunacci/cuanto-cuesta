class DomainError(Exception):
    """Base class for errors raised by the domain layer."""


class CurrencyMismatchError(DomainError):
    """Two amounts, or an amount and a fee or rate, are in incompatible currencies."""


class InvalidRouteError(DomainError):
    """A route definition is inconsistent (empty, broken currency chain, ...)."""


class UnknownFeeError(DomainError):
    """A step references a fee id that was not provided."""


class UnknownRateError(DomainError):
    """A step references a rate key that was not provided."""
