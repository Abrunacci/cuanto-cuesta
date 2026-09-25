/**
 * Compare routes: rank them by what they deliver and say how each one stands against the others.
 * For each route, `feeCost` is how many more target units it would deliver if every fee were
 * zero. The final amount and `feeCost` match the Python domain
 * (`backend/src/cuanto_cuesta/domain/comparison.py`), which also splits the rest of the cost
 * against a reference rate; the calculator no longer does.
 *
 * An input that was left empty is never read as zero: a route that needs it is reported as
 * incomplete, with the list of what is missing. A route whose own data is wrong (a currency that
 * does not chain, a malformed rate or fee) is reported as failed, and the others are still
 * compared: in stage 2 routes and fees can come from a pipeline.
 */

import { InvalidFeeError, withoutCharge, type Fee } from "./fees.ts";
import type { PositiveAmount, PositivePrice } from "./inputs.ts";
import { CurrencyMismatchError, subtract, type Money } from "./money.ts";
import { InvalidRateError, rate, type Rate, type RateDefinition } from "./rates.ts";
import {
  feeIds,
  rateKeys,
  runRoute,
  UnknownFeeError,
  UnknownRateError,
  type Route,
  type RouteResult,
} from "./routes.ts";

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

/** A route that cannot be computed because of its own data, not because of what was typed. */
export interface FailedRoute {
  readonly status: "failed";
  readonly route: Route;
  readonly error: DataError;
}

/** The errors a route's data can cause. Anything else is a bug and is not caught. */
export type DataError =
  CurrencyMismatchError | InvalidFeeError | InvalidRateError | UnknownFeeError | UnknownRateError;

export type RouteComparison = CompleteRoute | IncompleteRoute | FailedRoute;

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
  /** The routes whose data is wrong, in input order. */
  readonly failed: readonly FailedRoute[];
}

export function compareRoutes(input: ComparisonInput): Comparison {
  const { rates, brokenRates } = buildRates(input.rateDefinitions, input.prices);
  // Routes are ranked by what they deliver, which only compares within one currency.
  const target = input.routes[0]?.target;
  const complete: Unranked[] = [];
  const incomplete: IncompleteRoute[] = [];
  const failed: FailedRoute[] = [];
  for (const route of input.routes) {
    const broken = [...rateKeys(route)].find((key) => brokenRates.has(key));
    if (route.target !== target) {
      const error = new CurrencyMismatchError(
        `Route ${route.id} ends in ${route.target}, the others in ${String(target)}`,
      );
      failed.push({ status: "failed", route, error });
      continue;
    }
    if (broken !== undefined) {
      const error = brokenRates.get(broken);
      if (error !== undefined) {
        failed.push({ status: "failed", route, error });
        continue;
      }
    }
    const missing = missingInputs(route, input, rates);
    if (missing.length > 0 || input.amount === null) {
      incomplete.push({ status: "incomplete", route, missing });
      continue;
    }
    try {
      complete.push(compareOne(route, input.amount, knownFees(input.fees), rates));
    } catch (error) {
      if (!isDataError(error)) {
        throw error;
      }
      failed.push({ status: "failed", route, error });
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
  return { ranking: rank(complete), incomplete, failed };
}

/** Every route in the order it is shown: the ranking, the routes still incomplete, the failed. */
export function routesInOrder({ ranking, incomplete, failed }: Comparison): RouteComparison[] {
  switch (ranking.kind) {
    case "none":
      return [...incomplete, ...failed];
    case "alone":
      return [ranking.only, ...incomplete, ...failed];
    case "ranked":
      return [ranking.best, ...ranking.rest, ...incomplete, ...failed];
  }
}

function isDataError(error: unknown): error is DataError {
  return (
    error instanceof CurrencyMismatchError ||
    error instanceof InvalidFeeError ||
    error instanceof InvalidRateError ||
    error instanceof UnknownFeeError ||
    error instanceof UnknownRateError
  );
}

type Unranked = Omit<CompleteRoute, "standing">;

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

/** The rates of the prices typed, and the definitions that cannot make a rate, by key. */
function buildRates(
  definitions: readonly RateDefinition[],
  prices: ReadonlyMap<string, PositivePrice | null>,
): { rates: Map<string, Rate>; brokenRates: Map<string, InvalidRateError> } {
  const rates = new Map<string, Rate>();
  const brokenRates = new Map<string, InvalidRateError>();
  for (const definition of definitions) {
    const price = prices.get(definition.key) ?? null;
    if (price === null) {
      continue;
    }
    try {
      rates.set(definition.key, rate(definition.key, definition.base, definition.quote, price));
    } catch (error) {
      if (!(error instanceof InvalidRateError)) {
        throw error;
      }
      brokenRates.set(definition.key, error);
    }
  }
  return { rates, brokenRates };
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
