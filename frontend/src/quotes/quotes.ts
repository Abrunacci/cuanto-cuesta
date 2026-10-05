/**
 * The latest prices the backend has (`GET /api/rates`, see backend/README.md), read strictly: an
 * item that does not match what the calculator asks for is dropped, never shown. A price is only
 * a suggestion to prefill a field, so anything doubtful is better left out.
 */

import {
  Decimal,
  MAX_PRICE_DECIMALS,
  positivePrice,
  RATE_FIELDS,
  type PositivePrice,
} from "../calculator/index.ts";
import { inRange, PRICE_CHECKS } from "../form/plausible.ts";

/** The rate whose field is never prefilled: the comparison uses its estimate instead. */
export const CARD_KEY = "binance_card_usd_usdt";

export interface Quote {
  readonly key: string;
  readonly price: PositivePrice;
  /** Only for the card: the price its final payment screen is expected to show. */
  readonly estimatedFinal: PositivePrice | null;
  /** When the price was read at its source, in milliseconds since the epoch. */
  readonly observedAt: number;
  /**
   * The latest reading that jumped too far from this price, which the backend holds until the
   * next readings confirm it; null when there is none.
   */
  readonly held: HeldReading | null;
}

export interface HeldReading {
  readonly price: PositivePrice;
  readonly estimatedFinal: PositivePrice | null;
  readonly observedAt: number;
}

export interface RatesSnapshot {
  /** The backend's clock when it answered, so ages do not depend on the person's clock. */
  readonly serverTime: number;
  /** By rate key; a key without a usable price is absent. */
  readonly quotes: ReadonlyMap<string, Quote>;
}

/** The snapshot in a `GET /api/rates` body, or null when the body is not one. */
export function parseRates(body: unknown): RatesSnapshot | null {
  if (!isRecord(body) || !Array.isArray(body.rates)) {
    return null;
  }
  const serverTime = parseTimestamp(body.server_time);
  if (serverTime === null) {
    return null;
  }
  const quotes = new Map<string, Quote>();
  for (const item of body.rates as unknown[]) {
    const quote = parseQuote(item);
    if (quote !== null && !quotes.has(quote.key)) {
      quotes.set(quote.key, quote);
    }
  }
  return { serverTime, quotes };
}

function parseQuote(item: unknown): Quote | null {
  if (!isRecord(item) || typeof item.key !== "string") {
    return null;
  }
  const { key } = item;
  const field = RATE_FIELDS.find((candidate) => candidate.key === key);
  // The pair is checked too: an inverted price must not reach a field.
  if (field === undefined || item.base !== field.base || item.quote !== field.quote) {
    return null;
  }
  const price = parsePrice(key, item.price);
  const observedAt = parseTimestamp(item.observed_at);
  if (price === null || observedAt === null) {
    return null;
  }
  const estimatedFinal = key === CARD_KEY ? parsePrice(key, item.estimated_final) : null;
  return { key, price, estimatedFinal, observedAt, held: parseHeld(key, item.held) };
}

/** A held reading, or null when there is none or it does not parse: then there is nothing to say. */
function parseHeld(key: string, held: unknown): HeldReading | null {
  if (!isRecord(held)) {
    return null;
  }
  const price = parsePrice(key, held.price);
  const observedAt = parseTimestamp(held.observed_at);
  if (price === null || observedAt === null) {
    return null;
  }
  const estimatedFinal = key === CARD_KEY ? parsePrice(key, held.estimated_final) : null;
  return { price, estimatedFinal, observedAt };
}

/** The prices the comparison takes while their field is empty: the card's estimate. */
export function estimatedPrices(
  snapshot: RatesSnapshot | null,
): ReadonlyMap<string, PositivePrice> {
  const estimate = snapshot?.quotes.get(CARD_KEY)?.estimatedFinal ?? null;
  return estimate === null ? new Map() : new Map([[CARD_KEY, estimate]]);
}

const DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

/** A price the field could hold as typed: positive, in its plausible range, few decimals. */
function parsePrice(key: string, text: unknown): PositivePrice | null {
  if (typeof text !== "string" || !DECIMAL.test(text)) {
    return null;
  }
  // The backend keeps up to 10 decimals; trailing zeros do not count.
  const value = new Decimal(text);
  const [, fraction = ""] = value.toFixed().split(".");
  if (fraction.length > MAX_PRICE_DECIMALS) {
    return null;
  }
  const check = PRICE_CHECKS[key];
  if (check === undefined || !inRange(value, check)) {
    return null;
  }
  const result = positivePrice(value);
  return result.ok ? result.value : null;
}

/** RFC 3339 with a zone ("2026-10-01T15:00:00Z", "…T12:00:00.123456-03:00"); else null. */
const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/i;

export function parseTimestamp(text: unknown): number | null {
  if (typeof text !== "string") {
    return null;
  }
  const match = TIMESTAMP.exec(text);
  if (match === null) {
    return null;
  }
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction = "",
    zone,
    sign,
    zoneHour,
    zoneMinute,
  ] = match;
  const parts = [year, month, day, hour, minute, second].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [y, mo, d, h, mi, s] = parts;
  const local = Date.UTC(y, mo - 1, d, h, mi, s, Number(fraction.slice(0, 3).padEnd(3, "0")));
  const check = new Date(local);
  // Date.UTC rolls 31/09 over to 01/10: a date that rolls over does not exist.
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  ) {
    return null;
  }
  if (zone?.toUpperCase() === "Z") {
    return local;
  }
  const offset = (Number(zoneHour) * 60 + Number(zoneMinute)) * 60_000;
  return sign === "+" ? local - offset : local + offset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
