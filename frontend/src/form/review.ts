/**
 * What to check before trusting a route's result: fees the person has not set yet that hold a
 * value they must set (user-defined, at their neutral default) or an estimate. Fees the person
 * set are theirs to trust.
 */

import {
  feeDefault,
  isRecommended,
  RATE_FIELDS,
  type Ahead,
  type Behind,
  type Over,
  type Ranking,
  type CompleteRoute,
  type FeeDefault,
  type Route,
  type Tied,
} from "../calculator/index.ts";
import { rateInSentence, type Texts } from "../i18n/index.ts";
import { fieldId } from "./form.ts";

export interface FeesToReview {
  readonly toSet: readonly FeeDefault[];
  readonly estimated: readonly FeeDefault[];
  /** The route's fees holding the person's own value. */
  readonly own: readonly FeeDefault[];
}

export function feesToReview(route: Route, ownFees: ReadonlySet<string>): FeesToReview {
  const fees = route.steps
    .flatMap((step) => step.feeIds)
    .map((id) => feeDefault(id))
    .filter((d) => d !== undefined);
  const reference = fees.filter((d) => !ownFees.has(d.fee.id));
  return {
    toSet: reference.filter((d) => d.provenance.kind === "user_defined"),
    estimated: reference.filter((d) => d.provenance.kind === "estimate"),
    own: fees.filter((d) => ownFees.has(d.fee.id)),
  };
}

/**
 * The line that stands for a route's review list while it is folded: what there is to check,
 * counted, so a 0 left to set is seen without opening it; or, with nothing to check, how many
 * fees hold the person's value. Null when the route has none of either.
 */
export function reviewSummary(t: Texts, review: FeesToReview): string | null {
  const { toSet, estimated, own } = review;
  if (!hasFeesToCheck(review)) {
    return own.length > 0 ? t.review.ownFees(own.length) : null;
  }
  const parts = [
    ...(toSet.length > 0 ? [t.review.valuesToSet(toSet.length)] : []),
    ...(estimated.length > 0 ? [t.review.estimatedFees(estimated.length)] : []),
  ];
  return t.review.whatToCheck(t.list(parts));
}

/** Whether any fee holds a value to set or an estimate; the person's own values do not count. */
function hasFeesToCheck({ toSet, estimated }: FeesToReview): boolean {
  return toSet.length > 0 || estimated.length > 0;
}

/**
 * Whether "revisá" for a route opens its review list: only when it has fees to check. Otherwise
 * it goes to the route's heading, under which the unusual prices it was computed with are noted.
 */
export function reviewOpensList(route: Route, ownFees: ReadonlySet<string>): boolean {
  return hasFeesToCheck(feesToReview(route, ownFees));
}

/** Keys of the unusual prices a route's result depends on: the rates it converts with. */
export function unusualPriceKeys(route: Route, warnings: ReadonlyMap<string, string>): string[] {
  const keys = routeRateKeys(route);
  return RATE_FIELDS.filter(
    (field) => keys.has(field.key) && warnings.has(fieldId.price(field.key)),
  ).map((field) => field.key);
}

/** Names of the unusual prices a route's result depends on, as they read inside a sentence. */
export function unusualPrices(
  t: Texts,
  route: Route,
  warnings: ReadonlyMap<string, string>,
): string[] {
  return unusualPriceKeys(route, warnings).map((key) => rateInSentence(t, key));
}

/** The keys of the prices a route converts with. */
export function routeRateKeys(route: Route): ReadonlySet<string> {
  return new Set(
    route.steps.flatMap((step) => (step.conversion !== null ? [step.conversion.rateKey] : [])),
  );
}

/** Whether a route converts with a price taken from an estimate (`estimated` holds their keys). */
export function routeUsesEstimate(route: Route, estimated: ReadonlySet<string>): boolean {
  return [...routeRateKeys(route)].some((key) => estimated.has(key));
}

/** Whether a route's result rests on something to check: an estimate, a 0 to set, an odd price. */
export function routeNeedsReview(
  route: Route,
  ownFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): boolean {
  return (
    hasFeesToCheck(feesToReview(route, ownFees)) || unusualPriceKeys(route, warnings).length > 0
  );
}

/**
 * The route to check before trusting a route's difference, which rests on both routes compared:
 * the other one when it needs review (what the route itself needs is listed under it), else the
 * route itself; null when neither does.
 */
export function differenceToReview(
  route: Route,
  standing: Ahead | Behind | Over | Tied,
  ownFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): Route | null {
  if (routeNeedsReview(standing.other, ownFees, warnings)) {
    return standing.other;
  }
  return routeNeedsReview(route, ownFees, warnings) ? route : null;
}

/**
 * A route's difference figure: nothing to compare with (no other route, or no other route
 * without risk), or how the route stands, whether it is the recommended one (the best without
 * risk, or tied with it), and the route whose values to check before trusting it (null when none).
 */
export type Difference =
  | { readonly kind: "alone" }
  | { readonly kind: "unrivaled" }
  | {
      readonly kind: "compared";
      readonly standing: Ahead | Behind | Over | Tied;
      readonly recommended: boolean;
      readonly review: Route | null;
    };

export function difference(
  entry: CompleteRoute,
  ranking: Ranking,
  ownFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): Difference {
  const { standing } = entry;
  switch (standing.kind) {
    case "alone":
    case "unrivaled":
      return { kind: standing.kind };
    case "ahead":
    case "behind":
    case "over":
    case "tied":
      return {
        kind: "compared",
        standing,
        recommended: isRecommended(ranking, entry),
        review: differenceToReview(entry.route, standing, ownFees, warnings),
      };
  }
}
