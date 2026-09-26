/**
 * Compare routes: rank them by what they deliver and say how each one stands against the others.
 * For each route, `feeCost` is how many more target units it would deliver if every fee were
 * zero. The final amount and `feeCost` match what the Python domain computed before it was
 * removed; the tests keep a table of its results.
 *
 * An input that was left empty is never read as zero: a route that needs it is reported as
 * incomplete, with the list of what is missing. A route whose own data is wrong (a currency that
 * does not chain, a malformed rate or fee) is reported as failed, and the others are still
 * compared: in stage 2 routes and fees can come from a pipeline.
 */

import { InvalidFeeError, withoutCharge, type Fee } from "./fees.ts";
import type { PositiveAmount, PositivePrice } from "./inputs.ts";
import { CurrencyMismatchError, subtract, type Currency, type Money } from "./money.ts";
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
  /** The currency routes are compared in; a route that ends in another one fails. */
  readonly target: Currency;
  readonly rateDefinitions: readonly RateDefinition[];
  readonly amount: PositiveAmount | null;
  /** Price per rate key; missing or null when the person left it empty. */
  readonly prices: ReadonlyMap<string, PositivePrice | null>;
  /**
   * Fee per id, every known fee present; null when the person left it empty. A route that uses
   * an id not in the map fails.
   */
  readonly fees: ReadonlyMap<string, Fee | null>;
}

export type MissingInput =
  | { readonly kind: "amount" }
  | { readonly kind: "rate"; readonly key: string }
  | { readonly kind: "fee"; readonly id: string };

/**
 * The best route, `by` more than the runner-up (`other`). Among routes without risk when there is
 * one, else among the risky ones. `by` is positive.
 */
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

/**
 * A risky route that delivers `by` more than the best route (`other`), the best one without
 * risk: it is never recommended over it. `by` is positive.
 */
export interface Over {
  readonly kind: "over";
  readonly other: Route;
  readonly by: Money;
}

/**
 * Delivers the same as `other`: for the best route, its runner-up; for any other route, the best
 * one, or the leader when every route computed is risky.
 */
export interface Tied {
  readonly kind: "tied";
  readonly other: Route;
}

/** The only route that could be computed. */
export interface Alone {
  readonly kind: "alone";
}

/** The best route when every other route computed is risky: none to compare it with. */
export interface Unrivaled {
  readonly kind: "unrivaled";
}

/** How a complete route stands against the other complete routes. */
export type Standing = Ahead | Behind | Over | Tied | Alone | Unrivaled;

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
 * The complete routes. The best is the one that delivers most among those without risk: a risky
 * route (`Route.risk`) is never the best while another one can be computed. The best one is
 * compared with the runner-up without risk, and every other one with the best.
 *
 * - `alone`: one route could be computed, risky or not.
 * - `ranked`: several, at least two without risk. `above` holds the risky routes that deliver at
 *   least as much as the best, most first; `rest` the routes that deliver at most as much, the
 *   runner-up without risk among them.
 * - `unrivaled`: several, only one without risk, the best; the others are risky, in `above` and
 *   `rest` as for `ranked`, and at least one of the two holds a route.
 * - `risky`: several, every one risky. They are compared among themselves, best first, but none
 *   is recommended.
 */
export type Ranking =
  | { readonly kind: "none" }
  | { readonly kind: "alone"; readonly only: CompleteRoute<Alone> }
  | {
      readonly kind: "ranked";
      readonly above: readonly CompleteRoute<Over | Tied>[];
      readonly best: CompleteRoute<Ahead | Tied>;
      readonly rest: readonly CompleteRoute<Behind | Tied>[];
    }
  | {
      readonly kind: "unrivaled";
      readonly above: readonly CompleteRoute<Over | Tied>[];
      readonly best: CompleteRoute<Unrivaled>;
      readonly rest: readonly CompleteRoute<Behind | Tied>[];
    }
  | {
      readonly kind: "risky";
      readonly leader: CompleteRoute<Ahead | Tied>;
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
  const defined = new Set(input.rateDefinitions.map((d) => d.key));
  const complete: Unranked[] = [];
  const incomplete: IncompleteRoute[] = [];
  const failed: FailedRoute[] = [];
  for (const route of input.routes) {
    // What is wrong with the route's own data wins over what is still empty: filling a field
    // would not fix it.
    const error = dataError(route, input, defined, brokenRates);
    if (error !== null) {
      failed.push({ status: "failed", route, error });
      continue;
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
    case "unrivaled":
      return [...ranking.above, ranking.best, ...ranking.rest, ...incomplete, ...failed];
    case "risky":
      return [ranking.leader, ...ranking.rest, ...incomplete, ...failed];
  }
}

/**
 * A problem with the route's data found without running it. What only running it finds (a fee
 * in a currency the step never holds, a result in another currency than declared) shows once
 * every field it needs is filled.
 */
function dataError(
  route: Route,
  input: ComparisonInput,
  defined: ReadonlySet<string>,
  brokenRates: ReadonlyMap<string, InvalidRateError>,
): DataError | null {
  if (route.target !== input.target) {
    return new CurrencyMismatchError(
      `Route ${route.id} ends in ${route.target}, the comparison is in ${input.target}`,
    );
  }
  const unknownFee = [...feeIds(route)].find((id) => !input.fees.has(id));
  if (unknownFee !== undefined) {
    return new UnknownFeeError(`Route ${route.id} uses fee ${unknownFee}, which does not exist`);
  }
  const unknownRate = [...rateKeys(route)].find((key) => !defined.has(key));
  if (unknownRate !== undefined) {
    return new UnknownRateError(`Route ${route.id} uses rate ${unknownRate}, which does not exist`);
  }
  return (
    [...rateKeys(route)].map((key) => brokenRates.get(key)).find((e) => e !== undefined) ?? null
  );
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

/** Standings for complete routes sorted by what they deliver, most first. */
function rank(sorted: readonly Unranked[]): Ranking {
  const [first, second, ...others] = sorted;
  if (first === undefined) {
    return { kind: "none" };
  }
  if (second === undefined) {
    return { kind: "alone", only: { ...first, standing: { kind: "alone" } } };
  }
  const bestIndex = sorted.findIndex((entry) => entry.route.risk === null);
  const best = sorted[bestIndex];
  if (best === undefined) {
    return {
      kind: "risky",
      leader: { ...first, standing: lead(first, second) },
      rest: [trail(first, second), ...others.map((entry) => trail(first, entry))],
    };
  }
  const below = sorted.slice(bestIndex + 1);
  const runnerUp = below.find((entry) => entry.route.risk === null);
  const above = sorted.slice(0, bestIndex).map((entry) => over(best, entry));
  const rest = below.map((entry) => trail(best, entry));
  return runnerUp === undefined
    ? { kind: "unrivaled", above, best: { ...best, standing: { kind: "unrivaled" } }, rest }
    : { kind: "ranked", above, best: { ...best, standing: lead(best, runnerUp) }, rest };
}

/**
 * Whether the page recommends this route: the best route without risk, and any route without
 * risk tied with it. When every route computed is risky, or only one could be computed, none is.
 */
export function isRecommended(ranking: Ranking, entry: CompleteRoute): boolean {
  switch (ranking.kind) {
    case "none":
    case "alone":
    case "risky":
      return false;
    case "ranked":
    case "unrivaled":
      // With no rival, no other route without risk can tie with the best: only it passes.
      return (
        entry.route.risk === null && (entry === ranking.best || entry.standing.kind === "tied")
      );
  }
}

/** How `best` stands against `runnerUp`, which delivers at most as much. */
function lead(best: Unranked, runnerUp: Unranked): Ahead | Tied {
  const by = subtract(best.result.final, runnerUp.result.final);
  return by.amount.eq(0)
    ? { kind: "tied", other: runnerUp.route }
    : { kind: "ahead", other: runnerUp.route, by };
}

/** `entry`, which delivers at most as much as `best`, against it. */
function trail(best: Unranked, entry: Unranked): CompleteRoute<Behind | Tied> {
  const by = subtract(best.result.final, entry.result.final);
  return {
    ...entry,
    standing: by.amount.eq(0)
      ? { kind: "tied", other: best.route }
      : { kind: "behind", other: best.route, by },
  };
}

/** A risky `entry`, which delivers at least as much as `best`, against it. */
function over(best: Unranked, entry: Unranked): CompleteRoute<Over | Tied> {
  const by = subtract(entry.result.final, best.result.final);
  return {
    ...entry,
    standing: by.amount.eq(0)
      ? { kind: "tied", other: best.route }
      : { kind: "over", other: best.route, by },
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
