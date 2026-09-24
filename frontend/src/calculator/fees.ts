/**
 * A fee is one of two types, so an invalid combination cannot be built:
 *
 * - `FixedFee`: a fixed amount of money.
 * - `PercentFee`: a percentage of the amount, with an optional minimum.
 *
 * `charge` rounds every fee up to the minor unit, as the rounding policy in `money` requires.
 */

import {
  CurrencyMismatchError,
  Decimal,
  money,
  roundedUp,
  zero,
  type Big,
  type Currency,
  type Money,
} from "./money.ts";

export interface FixedFee {
  readonly kind: "fixed";
  readonly id: string;
  readonly amount: Money;
}

export interface PercentFee {
  readonly kind: "percent";
  readonly id: string;
  /** Percentage points: 0.6 means 0.6 %. */
  readonly rate: Big;
  /** Charged instead of the percentage when the percentage comes out lower. */
  readonly minimum: Money | null;
}

export type Fee = FixedFee | PercentFee;

export class InvalidFeeError extends Error {
  override name = "InvalidFeeError";
}

export function fixedFee(id: string, amount: string | Big, currency: Currency): FixedFee {
  const value = money(amount, currency);
  requireNonNegative(id, value.amount);
  return { kind: "fixed", id, amount: value };
}

export function percentFee(
  id: string,
  rate: string | Big,
  minimum: Money | null = null,
): PercentFee {
  const value = new Decimal(rate);
  if (value.lt(0) || value.gt(100)) {
    throw new InvalidFeeError(`Fee ${id}: percentage must be between 0 and 100`);
  }
  if (minimum !== null) {
    requireNonNegative(`${id} minimum`, minimum.amount);
  }
  return { kind: "percent", id, rate: value, minimum };
}

/** The fee charged on `amount`, rounded up to the minor unit. */
export function charge(fee: Fee, amount: Money): Money {
  switch (fee.kind) {
    case "fixed":
      requireCurrency(fee.id, fee.amount.currency, amount.currency);
      return roundedUp(fee.amount);
    case "percent": {
      const share = roundedUp({
        amount: amount.amount.times(fee.rate).div(100),
        currency: amount.currency,
      });
      if (fee.minimum === null) {
        return share;
      }
      requireCurrency(fee.id, fee.minimum.currency, amount.currency);
      const floor = roundedUp(fee.minimum);
      return share.amount.lt(floor.amount) ? floor : share;
    }
  }
}

/** The same fee set to zero, minimum included. */
export function withoutCharge(fee: Fee): Fee {
  switch (fee.kind) {
    case "fixed":
      return { kind: "fixed", id: fee.id, amount: zero(fee.amount.currency) };
    case "percent":
      return { kind: "percent", id: fee.id, rate: new Decimal(0), minimum: null };
  }
}

function requireNonNegative(what: string, value: Big): void {
  if (value.lt(0)) {
    throw new InvalidFeeError(`Fee ${what} must not be negative`);
  }
}

function requireCurrency(feeId: string, feeCurrency: Currency, amountCurrency: Currency): void {
  if (feeCurrency !== amountCurrency) {
    throw new CurrencyMismatchError(
      `Fee ${feeId} is in ${feeCurrency}, cannot charge it on ${amountCurrency}`,
    );
  }
}
