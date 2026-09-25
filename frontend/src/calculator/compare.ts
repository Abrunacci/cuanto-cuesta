/**
 * Compare routes: rank them by what they deliver and say how each one stands against the others.
 * For each route, `feeCost` is how many more target units it would deliver if every fee were
 * zero; the Python domain (`backend/src/cuanto_cuesta/domain/comparison.py`) computes the same.
 *
 * An input that was left empty is never read as zero: a route that needs it is reported as
 * incomplete, with the list of what is missing.
 */

import { withoutCharge, type Fee } from "./fees.ts";
import type { PositiveAmount, PositivePrice } from "./inputs.ts";
import { CurrencyMismatchError, subtract, type Money } from "./money.ts";
import { rate, type Rate, type RateDefinition } from "./rates.ts";
import { feeIds, rateKeys, runRoute, type Route, type RouteResult } from "./routes.ts";

export interface ComparisonInput {
  readonly routes: readonly Route[];
  readonly rateDefinitions: readonly RateDefinition[];
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

/** The best route, `by` more than the runner-up (`other`). `by` is positive. */
export interface Ahead {
  readonly kind: "ahead";
  readonly other: Route;
  readonly by: Money;
}

/** `by` less than the best route (`other`). `by` is positive. */
export interface Behind {
  readonly kind: "behind";
  readonly other: Route;
  readonly by: Money;
}

/** Delivers the same as `other`: the runner-up for the best route, else the best one. */
export interface Tied {
  readonly kind: "tied";
  readonly other: Route;
}

/** The only route that could be computed. */
export interface Alone {
  readonly kind: "alone";
}

/** How a complete route stands against the other complete routes. */
export type Standing = Ahead | Behind | Tied | Alone;

export interface CompleteRoute<S extends Standing = Standing> {
  readonly status: "complete";
  readonly route: Route;
  readonly result: RouteResult;
  readonly standing: S;
  readonly feeCost: Money;
}

export interface IncompleteRoute {
  readonly status: "incomplete";
  readonly route: Route;
  readonly missing: readonly MissingInput[];
}

export type RouteComparison = CompleteRoute | IncompleteRoute;

/**
 * The complete routes, best (most received) first. The best one is compared with the runner-up
 * and every other one with the best, so the best is never behind and only a lone route is alone.
 */
export type Ranking =
  | { readonly kind: "none" }
  | { readonly kind: "alone"; readonly only: CompleteRoute<Alone> }
  | {
      readonly kind: "ranked";
      readonly best: CompleteRoute<Ahead | Tied>;
      readonly rest: readonly [
        CompleteRoute<Behind | Tied>,
        ...(readonly CompleteRoute<Behind | Tied>[]),
      ];
    };

export interface Comparison {
  readonly ranking: Ranking;
  /** The routes that cannot be computed yet, in input order. */
  readonly incomplete: readonly IncompleteRoute[];
}

export function compareRoutes(input: ComparisonInput): Comparison {
  const rates = buildRates(input.rateDefinitions, input.prices);
  requireOneTarget(input.routes);
  const complete: Unranked[] = [];
  const incomplete: IncompleteRoute[] = [];
  for (const route of input.routes) {
    const missing = missingInputs(route, input, rates);
    if (missing.length > 0 || input.amount === null) {
      incomplete.push({ status: "incomplete", route, missing });
    } else {
      complete.push(compareOne(route, input.amount, knownFees(input.fees), rates));
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
  return { ranking: rank(complete), incomplete };
}

/** Every route in the order it is shown: the ranking, then the routes still incomplete. */
export function routesInOrder({ ranking, incomplete }: Comparison): RouteComparison[] {
  switch (ranking.kind) {
    case "none":
      return [...incomplete];
    case "alone":
      return [ranking.only, ...incomplete];
    case "ranked":
      return [ranking.best, ...ranking.rest, ...incomplete];
  }
}

type Unranked = Omit<CompleteRoute, "standing">;

/** Routes are ranked by what they deliver, which only compares within one currency. */
function requireOneTarget(routes: readonly Route[]): void {
  const [first] = routes;
  for (const route of routes) {
    if (first !== undefined && route.target !== first.target) {
      throw new CurrencyMismatchError(
        `Route ${route.id} ends in ${route.target}, route ${first.id} in ${first.target}`,
      );
    }
  }
}

/** Standings for complete routes sorted best first. */
function rank(sorted: readonly Unranked[]): Ranking {
  const [best, runnerUp, ...others] = sorted;
  if (best === undefined) {
    return { kind: "none" };
  }
  if (runnerUp === undefined) {
    return { kind: "alone", only: { ...best, standing: { kind: "alone" } } };
  }
  // Sorted best first, so these differences are never negative.
  const lead = subtract(best.result.final, runnerUp.result.final);
  const trail = (entry: Unranked): CompleteRoute<Behind | Tied> => {
    const by = subtract(best.result.final, entry.result.final);
    return {
      ...entry,
      standing: by.amount.eq(0)
        ? { kind: "tied", other: best.route }
        : { kind: "behind", other: best.route, by },
    };
  };
  return {
    kind: "ranked",
    best: {
      ...best,
      standing: lead.amount.eq(0)
        ? { kind: "tied", other: runnerUp.route }
        : { kind: "ahead", other: runnerUp.route, by: lead },
    },
    rest: [trail(runnerUp), ...others.map(trail)],
  };
}

function compareOne(
  route: Route,
  amount: Money,
  fees: ReadonlyMap<string, Fee>,
  rates: ReadonlyMap<string, Rate>,
): Unranked {
  const result = runRoute(route, amount, fees, rates);
  const withoutFees = runRoute(route, amount, zeroed(fees, route), rates);
  return {
    status: "complete",
    route,
    result,
    feeCost: subtract(withoutFees.final, result.final),
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
