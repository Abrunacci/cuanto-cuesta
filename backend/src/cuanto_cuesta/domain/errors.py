class DomainError(Exception):
    """Base class for errors raised by the domain layer."""


class CurrencyMismatchError(DomainError):
    """Two amounts are in different currencies."""
