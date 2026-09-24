/**
 * The range each price can plausibly be in, to catch a number read a thousand times off: "1.030"
 * typed for a P2P price of 1.03, or "1,536" pasted in English notation for a MEP of 1536. These
 * are sanity bounds, not market data: far wider than any real price, they only reject what
 * cannot be right.
 */

import { Decimal, type Big } from "../calculator/index.ts";

export interface PriceCheck {
  readonly min: Big;
  readonly max: Big;
  /** How the price reads on screen, e.g. "ARS por USD". */
  readonly unit: string;
}

export const PRICE_CHECKS: Readonly<Record<string, PriceCheck>> = {
  mep: { min: new Decimal(100), max: new Decimal(100_000), unit: "ARS por USD" },
  p2p_usdt_usd: { min: new Decimal("0.5"), max: new Decimal(2), unit: "USD por USDT" },
  bitso_usdt_ars: { min: new Decimal(100), max: new Decimal(100_000), unit: "ARS por USDT" },
  arq_usd_ars: { min: new Decimal(100), max: new Decimal(100_000), unit: "ARS por USDc" },
};

/** The value a thousand times smaller or larger, if that one is in range. */
export function thousandfoldFix(value: Big, check: PriceCheck): Big | null {
  for (const candidate of [value.div(1000), value.times(1000)]) {
    if (candidate.gte(check.min) && candidate.lte(check.max)) {
      return candidate;
    }
  }
  return null;
}
