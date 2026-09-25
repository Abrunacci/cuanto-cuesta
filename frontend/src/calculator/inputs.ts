/**
 * What the person types, validated once. `compareRoutes` only takes these types, so a zero or
 * negative price, or an amount with fractions of a cent, can never reach the calculation.
 *
 * The limits also keep the calculation on the same cent as the Python domain it was checked
 * against (since removed). Python rounded each product and quotient to 34 significant digits;
 * TypeScript multiplies exactly and divides with 30 decimal places. With prices between 1e-8 and `MAX_PRICE` and amounts up to `MAX_AMOUNT`, a
 * route with two conversions stays near 1e21 at most, far from where the two can differ by a
 * cent (around 1e23). A route that chains more conversions needs these limits reviewed.
 */

import { Decimal, minorUnitDecimals, money, type Big, type Currency, type Money } from "./money.ts";

declare const positivePriceBrand: unique symbol;
declare const positiveAmountBrand: unique symbol;

/** A price greater than zero, up to `MAX_PRICE`, with at most `MAX_PRICE_DECIMALS` decimals. */
export type PositivePrice = Big & { readonly [positivePriceBrand]: true };

/** An amount greater than zero, in whole cents, up to `MAX_AMOUNT`. */
export type PositiveAmount = Money & { readonly [positiveAmountBrand]: true };

export const MAX_PRICE_DECIMALS = 8;
/** Far above any real price (the MEP is in the thousands): it only catches typos. */
export const MAX_PRICE = new Decimal(1_000_000);
/**
 * Far above any real Payoneer balance: it only catches typos. It does not depend on the currency
 * because every route starts in USD; a route starting in ARS would need its own cap.
 */
export const MAX_AMOUNT = new Decimal(10_000_000);

export type InputProblem =
  | { readonly code: "not_positive" }
  | { readonly code: "too_many_decimals"; readonly max: number }
  | { readonly code: "too_large"; readonly max: Big };

export type Validated<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: InputProblem };

export function positivePrice(value: Big): Validated<PositivePrice> {
  const problem =
    positiveProblem(value, MAX_PRICE_DECIMALS) ??
    (value.gt(MAX_PRICE) ? { code: "too_large" as const, max: MAX_PRICE } : null);
  return problem === null ? { ok: true, value: value as PositivePrice } : { ok: false, problem };
}

export function positiveAmount(value: Big, currency: Currency): Validated<PositiveAmount> {
  const problem =
    positiveProblem(value, minorUnitDecimals(currency)) ??
    (value.gt(MAX_AMOUNT) ? { code: "too_large" as const, max: MAX_AMOUNT } : null);
  return problem === null
    ? { ok: true, value: money(value, currency) as PositiveAmount }
    : { ok: false, problem };
}

function positiveProblem(value: Big, maxDecimals: number): InputProblem | null {
  if (value.lte(0)) {
    return { code: "not_positive" };
  }
  if (decimals(value) > maxDecimals) {
    return { code: "too_many_decimals", max: maxDecimals };
  }
  return null;
}

function decimals(value: Big): number {
  // big.js keeps the significant digits in `c` and the exponent in `e`, without trailing zeros.
  return Math.max(0, value.c.length - value.e - 1);
}
