from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from cuanto_cuesta.domain.errors import CurrencyMismatchError
from cuanto_cuesta.domain.money import Currency, Money, div, mul


@dataclass(frozen=True, slots=True)
class Rate:
    """Price of one unit of ``base`` expressed in ``quote``.

    ``bid`` is what you get when selling ``base``; ``ask`` is what you pay
    when buying it. The side is therefore implied by the direction of the
    conversion and never configured by hand.
    """

    key: str
    base: Currency
    quote: Currency
    bid: Decimal
    ask: Decimal

    def __post_init__(self) -> None:
        if self.base is self.quote:
            raise ValueError(f"Rate {self.key!r}: base and quote must differ")
        for name, price in (("bid", self.bid), ("ask", self.ask)):
            if not isinstance(price, Decimal) or not price.is_finite() or price <= 0:
                raise ValueError(f"Rate {self.key!r}: {name} must be a positive Decimal")

    def price_for(self, source: Currency, target: Currency) -> Decimal:
        """Price applied when converting from ``source`` to ``target``."""
        if source is self.base and target is self.quote:
            return self.bid
        if source is self.quote and target is self.base:
            return self.ask
        raise CurrencyMismatchError(
            f"Rate {self.key!r} ({self.base}/{self.quote}) cannot convert {source} to {target}"
        )

    def convert(self, amount: Money, target: Currency) -> Money:
        """Convert ``amount`` into ``target``, rounded down to the minor unit."""
        price = self.price_for(amount.currency, target)
        if amount.currency is self.base:
            converted = mul(amount.amount, price)
        else:
            converted = div(amount.amount, price)
        return Money(converted, target).rounded_down()
