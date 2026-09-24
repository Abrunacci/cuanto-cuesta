/**
 * The caps on fee values, for defaults and user edits alike. Mirrors
 * `backend/src/cuanto_cuesta/application/limits.py`.
 *
 * They reject typos and nonsense (a 90 % fee, a 5000 USD fixed fee), not unusual but real fees.
 * Problems are codes, not sentences: the screen writes the message.
 */

import type { Fee } from "./fees.ts";
import { Decimal, type Big, type Currency } from "./money.ts";

export const MAX_PERCENT = new Decimal(20);

export function maxFixed(currency: Currency): Big {
  switch (currency) {
    case "USD":
    case "USDT":
    case "USDC":
      return new Decimal(100);
    case "ARS":
      return new Decimal(150_000);
  }
}

export type ValueProblem =
  { readonly code: "negative" } | { readonly code: "above_cap"; readonly cap: Big };

export function valueProblem(value: Big, cap: Big): ValueProblem | null {
  if (value.lt(0)) {
    return { code: "negative" };
  }
  if (value.gt(cap)) {
    return { code: "above_cap", cap };
  }
  return null;
}

/** The cap for a fee's main value: a percentage or an amount in the fee's currency. */
export function valueCap(fee: Fee): Big {
  switch (fee.kind) {
    case "fixed":
      return maxFixed(fee.amount.currency);
    case "percent":
      return MAX_PERCENT;
  }
}
