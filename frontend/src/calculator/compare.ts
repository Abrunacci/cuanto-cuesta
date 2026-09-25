/**
 * Compare routes: rank them by what they deliver, say how each one stands against the others,
 * and split each route's cost into fees and exchange rate against a reference rate (the MEP
 * dollar). The split mirrors `backend/src/cuanto_cuesta/domain/comparison.py`:
 *
 *     amount x reference = final + feeCost + fxLoss
 *
 * - `feeCost`: how many more target units the route would deliver if every fee were zero.
 * - `fxLoss`: the rest, how far the route's rates (and rounding) fall short of the reference.
 *   It is negative when the route beats the reference.
 * - `lossVsReference` = `feeCost + fxLoss`; negative means a gain over the reference.
 *
 * Unlike the Python domain, a route does not need the reference to be computed: only the rates
 * it converts with. Without the reference its `fxLoss` and `lossVsReference` are null.
 *
 * An input that was left empty is never read as zero: a route that needs it is reported as
 * incomplete, with the list of what is missing.
 */

import { withoutCharge, type Fee } from "./fees.ts";
import type { PositiveAmount, PositivePrice } from "./inputs.ts";
import { add, CurrencyMismatchError, subtract, type Money } from "./money.ts";
import { convert, rate, type Rate, type RateDefinition } from "./rates.ts";
import { feeIds, rateKeys, runRoute, type Route, type RouteResult } from "./routes.ts";

export interface ComparisonInput {
  readonly routes: readonly Route[];
  readonly rateDefinitions: readonly RateDefinition[];
  /** Key of the rate used as the reference; it is also a rate routes can convert with. */
  readonly referenceKey: string;
  readonly amount: PositiveAmount | null;
  /** Price per rate key; missing or null when the person left it empty. */
  readonly prices: ReadonlyMap<string, PositivePrice | null>;
  /** Fee per id; missing or null when the person left it empty. */
  readonly fees: ReadonlyMap<string, Fee | null>;
}

export type MissingInput =
  | { readonly kind: "amount" }
  | { readonly kind: "rate"; readonly key: string }
  | { readonly kind: "fee"; readonly id: string };

/**
 * How a complete route stands against the other complete routes. The best route is compared
 * with the runner-up, every other route with the best one. `by` is always positive: a zero
 * difference is a tie.
 */
export type Standing =
  /** The best route, `by` more than the runner-up (`other`). */
  | { readonly kind: "ahead"; readonly other: Route; readonly by: Money }
  /** `by` less than the best route (`other`). */
  | { readonly kind: "behind"; readonly other: Route; readonly by: Money }
  /** Delivers the same as `other`: the runner-up for the best route, else the best one. */
  | { readonly kind: "tied"; readonly other: Route }
  /** The only route that could be computed. */
  | { readonly kind: "alone" };

export interface CompleteRoute {
  readonly status: "complete";
  readonly route: Route;
  readonly result: RouteResult;
  readonly standing: Standing;
  readonly feeCost: Money;
  /** Null while the reference price is missing. */
  readonly fxLoss: Money | null;
  /** Null while the reference price is missing. */
  readonly lossVsReference: Money | null;
}

export interface IncompleteRoute {
  readonly status: "incomplete";
  readonly route: Route;
  readonly missing: readonly MissingInput[];
}

export type RouteComparison = CompleteRoute | IncompleteRoute;

export interface Comparison {
  /** `amount x reference`, or null while the amount or the reference is missing. */
  readonly atReference: Money | null;
  /** Complete routes first, best (most received) first; then incomplete ones in input order. */
  readonly routes: readonly RouteComparison[];
}

export function compareRoutes(input: ComparisonInput): Comparison {
  const rates = buildRates(input.rateDefinitions, input.prices);
  const reference = rates.get(input.referenceKey) ?? null;
  const atReference =
    input.amount !== null && reference !== null
      ? convert(reference, input.amount, reference.quote)
      : null;

  const complete: Unranked[] = [];
  const incomplete: IncompleteRoute[] = [];
  for (const route of input.routes) {
    const missing = missingInputs(route, input, rates);
    if (missing.length > 0 || input.amount === null) {
      incomplete.push({ status: "incomplete", route, missing });
    } else {
      complete.push(compareOne(route, input.amount, knownFees(input.fees), rates, atReference));
    }
  }
  complete.sort((a, b) => {
    const byFinal = b.result.final.amount.cmp(a.result.final.amount);
    if (byFinal !== 0) {
      return byFinal;
    }
    // By code point, like Python, so the order does not depend on the locale.
    return a.route.id < b.route.id ? -1 : a.route.id > b.route.id ? 1 : 0;
  });
  const [best, runnerUp] = complete;
  const ranked = complete.map((entry): CompleteRoute => ({
    ...entry,
    standing: standing(entry, best, runnerUp),
  }));
  return { atReference, routes: [...ranked, ...incomplete] };
}

type Unranked = Omit<CompleteRoute, "standing">;

function standing(
  entry: Unranked,
  best: Unranked | undefined,
  runnerUp: Unranked | undefined,
): Standing {
  if (best === undefined || runnerUp === undefined) {
    return { kind: "alone" };
  }
  const isBest = entry === best;
  const other = isBest ? runnerUp : best;
  // Routes are sorted best first, so this is never negative.
  const by = isBest
    ? subtract(entry.result.final, other.result.final)
    : subtract(other.result.final, entry.result.final);
  if (by.amount.eq(0)) {
    return { kind: "tied", other: other.route };
  }
  return { kind: isBest ? "ahead" : "behind", other: other.route, by };
}

function compareOne(
  route: Route,
  amount: Money,
  fees: ReadonlyMap<string, Fee>,
  rates: ReadonlyMap<string, Rate>,
  atReference: Money | null,
): Unranked {
  if (atReference !== null && route.target !== atReference.currency) {
    throw new CurrencyMismatchError(
      `Route ${route.id} ends in ${route.target}, the reference is in ${atReference.currency}`,
    );
  }
  const result = runRoute(route, amount, fees, rates);
  const withoutFees = runRoute(route, amount, zeroed(fees, route), rates);
  const feeCost = subtract(withoutFees.final, result.final);
  const fxLoss = atReference === null ? null : subtract(atReference, withoutFees.final);
  return {
    status: "complete",
    route,
    result,
    feeCost,
    fxLoss,
    lossVsReference: fxLoss === null ? null : add(feeCost, fxLoss),
  };
}

function missingInputs(
  route: Route,
  input: ComparisonInput,
  rates: ReadonlyMap<string, Rate>,
): MissingInput[] {
  const missing: MissingInput[] = [];
  if (input.amount === null) {
    missing.push({ kind: "amount" });
  }
  for (const key of new Set(rateKeys(route))) {
    if (!rates.has(key)) {
      missing.push({ kind: "rate", key });
    }
  }
  for (const id of feeIds(route)) {
    if ((input.fees.get(id) ?? null) === null) {
      missing.push({ kind: "fee", id });
    }
  }
  return missing;
}

function buildRates(
  definitions: readonly RateDefinition[],
  prices: ReadonlyMap<string, PositivePrice | null>,
): Map<string, Rate> {
  const rates = new Map<string, Rate>();
  for (const definition of definitions) {
    const price = prices.get(definition.key) ?? null;
    if (price !== null) {
      rates.set(definition.key, rate(definition.key, definition.base, definition.quote, price));
    }
  }
  return rates;
}

function knownFees(fees: ReadonlyMap<string, Fee | null>): Map<string, Fee> {
  const known = new Map<string, Fee>();
  for (const [id, fee] of fees) {
    if (fee !== null) {
      known.set(id, fee);
    }
  }
  return known;
}

function zeroed(fees: ReadonlyMap<string, Fee>, route: Route): Map<string, Fee> {
  const zeroedFees = new Map<string, Fee>();
  for (const id of feeIds(route)) {
    const fee = fees.get(id);
    if (fee !== undefined) {
      zeroedFees.set(id, withoutCharge(fee));
    }
  }
  return zeroedFees;
}
