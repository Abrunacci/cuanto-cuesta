/**
 * Money, currencies and the single place where rounding happens. Mirrors
 * `backend/src/cuanto_cuesta/domain/money.py`.
 *
 * - Intermediate arithmetic is exact for `+`, `-` and `*`. Division keeps 30 decimal places,
 *   rounding half-even. For the inputs `inputs.ts` accepts (prices with up to 8 decimals, amounts
 *   in whole cents up to 10 million) it lands on the same cent as the domain's 34 significant
 *   digits.
 * - An amount credited to the user (each conversion and each step output) is rounded down to
 *   the currency's minor unit: the calculator never promises more than a platform would credit.
 * - A fee charged to the user is rounded up to the minor unit, for the same reason.
 *
 * Nothing else rounds.
 */

import BigConstructor from "big.js";
import type { Big } from "big.js";

/** A Big constructor with its own settings, so the global big.js defaults stay untouched. */
export const Decimal = BigConstructor();
Decimal.DP = 30;
Decimal.RM = BigConstructor.roundHalfEven;

export type { Big };

export type Currency = "USD" | "USDT" | "USDC" | "ARS";

const MINOR_UNIT_DECIMALS: Record<Currency, number> = {
  USD: 2,
  USDT: 2,
  USDC: 2,
  ARS: 2,
};

/** Only this module has it, so only `money()` can call the `Money` constructor. */
const construct: unique symbol = Symbol("Money");

/**
 * An amount in a currency. Only `money()` builds one, and it always converts the amount to
 * `Decimal`, so every operation uses this module's settings even if the caller made its `Big`
 * with the global big.js constructor.
 */
export class Money {
  readonly amount: Big;
  readonly currency: Currency;
  /** Makes the type nominal: a plain `{ amount, currency }` object is not a `Money`. */
  declare private readonly nominal: never;

  constructor(key: typeof construct, amount: Big, currency: Currency) {
    if (key !== construct) {
      throw new TypeError("Use money() to build a Money");
    }
    this.amount = amount;
    this.currency = currency;
  }
}

export function money(amount: Big | string, currency: Currency): Money {
  return new Money(construct, new Decimal(amount), currency);
}

export function minorUnitDecimals(currency: Currency): number {
  return MINOR_UNIT_DECIMALS[currency];
}

export function zero(currency: Currency): Money {
  return money("0", currency);
}

export function add(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return money(a.amount.plus(b.amount), a.currency);
}

export function subtract(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return money(a.amount.minus(b.amount), a.currency);
}

export function isNegative(value: Money): boolean {
  return value.amount.lt(0);
}

/** Round an amount credited to the user. */
export function roundedDown(value: Money): Money {
  return round(value, BigConstructor.roundDown);
}

/** Round a fee charged to the user. */
export function roundedUp(value: Money): Money {
  return round(value, BigConstructor.roundUp);
}

export function sameMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount.eq(b.amount);
}

export class CurrencyMismatchError extends Error {
  override name = "CurrencyMismatchError";
}

function round(
  value: Money,
  mode: typeof BigConstructor.roundDown | typeof BigConstructor.roundUp,
): Money {
  return money(value.amount.round(minorUnitDecimals(value.currency), mode), value.currency);
}

function requireSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(`Cannot combine ${a.currency} and ${b.currency} amounts`);
  }
}
