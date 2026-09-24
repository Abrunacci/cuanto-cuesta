/**
 * The range each price can plausibly be in, to catch a number read a thousand times off: "1.030"
 * typed for a P2P price of 1.03, or "1,536" pasted in English notation for a MEP of 1536. These
 * are sanity bounds, not market data: in 2026 the peso prices are around 1,540, three times the
 * lower bound and a thirtieth of the upper one. They need widening if prices move that far.
 */

import { Decimal, type Big } from "../calculator/index.ts";

export interface PriceCheck {
  readonly min: Big;
  readonly max: Big;
  /** How the price reads on screen, e.g. "ARS por USD". */
  readonly unit: string;
}

export const PRICE_CHECKS: Readonly<Record<string, PriceCheck>> = {
  mep: { min: new Decimal(500), max: new Decimal(50_000), unit: "ARS por USD" },
  p2p_usdt_usd: { min: new Decimal("0.5"), max: new Decimal(2), unit: "USD por USDT" },
  bitso_usdt_ars: { min: new Decimal(500), max: new Decimal(50_000), unit: "ARS por USDT" },
  arq_usd_ars: { min: new Decimal(500), max: new Decimal(50_000), unit: "ARS por USDc" },
};

export function inRange(value: Big, check: PriceCheck): boolean {
  return value.gte(check.min) && value.lte(check.max);
}
