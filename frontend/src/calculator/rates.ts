import {
  CurrencyMismatchError,
  Decimal,
  money,
  roundedDown,
  type Big,
  type Currency,
  type Money,
} from "./money.ts";

/**
 * Price of one unit of `base` in `quote`, as the person types it for their own operation (for
 * example ARS per USDT when selling USDT). Converting `base` to `quote` multiplies by it;
 * converting `quote` to `base` divides.
 */
export interface Rate {
  readonly key: string;
  readonly base: Currency;
  readonly quote: Currency;
  readonly price: Big;
}

export class InvalidRateError extends Error {
  override name = "InvalidRateError";
}

export function rate(key: string, base: Currency, quote: Currency, price: string | Big): Rate {
  const value = new Decimal(price);
  if (base === quote) {
    throw new InvalidRateError(`Rate ${key}: base and quote must differ`);
  }
  if (value.lte(0)) {
    throw new InvalidRateError(`Rate ${key}: price must be positive`);
  }
  return { key, base, quote, price: value };
}

/** Convert `amount` into `target`, rounded down to the minor unit. */
export function convert(rate: Rate, amount: Money, target: Currency): Money {
  if (amount.currency === rate.base && target === rate.quote) {
    return roundedDown(money(amount.amount.times(rate.price), target));
  }
  if (amount.currency === rate.quote && target === rate.base) {
    return roundedDown(money(amount.amount.div(rate.price), target));
  }
  throw new CurrencyMismatchError(
    `Rate ${rate.key} (${rate.base}/${rate.quote}) cannot convert ${amount.currency} to ${target}`,
  );
}
