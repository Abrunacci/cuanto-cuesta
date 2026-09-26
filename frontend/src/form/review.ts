/**
 * What to check before trusting a route's result: fees the person has not set yet that hold a
 * value they must set (user-defined, at their neutral default) or an estimate. Fees the person
 * set are theirs to trust.
 */

import {
  feeDefault,
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
import { lowerFirst } from "../text/case.ts";
import { joinSpanish } from "../text/lists.ts";
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
export function reviewSummary(review: FeesToReview): string | null {
  const { toSet, estimated, own } = review;
  if (!hasFeesToCheck(review)) {
    return own.length > 0 ? `Con tu valor: ${count(own.length, "comisión", "comisiones")}` : null;
  }
  const parts = [
    ...(toSet.length > 0 ? [count(toSet.length, "valor para poner", "valores para poner")] : []),
    ...(estimated.length > 0
      ? [count(estimated.length, "comisión estimada", "comisiones estimadas")]
      : []),
  ];
  return `Qué revisar: ${joinSpanish(parts)}`;
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

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** Labels of the unusual prices a route's result depends on: the rates it converts with. */
export function unusualPrices(route: Route, warnings: ReadonlyMap<string, string>): string[] {
  const keys = new Set(
    route.steps.flatMap((step) => (step.conversion !== null ? [step.conversion.rateKey] : [])),
  );
  return RATE_FIELDS.filter(
    (field) => keys.has(field.key) && warnings.has(fieldId.price(field.key)),
  ).map((field) => lowerFirst(field.label));
}

/** Whether a route's result rests on something to check: an estimate, a 0 to set, an odd price. */
export function routeNeedsReview(
  route: Route,
  ownFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): boolean {
  return hasFeesToCheck(feesToReview(route, ownFees)) || unusualPrices(route, warnings).length > 0;
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
        recommended: isRecommended(entry, ranking),
        review: differenceToReview(entry.route, standing, ownFees, warnings),
      };
  }
}

/**
 * The best route without risk, and any route without risk tied with it. When every route
 * computed is risky, none is.
 */
function isRecommended(entry: CompleteRoute, ranking: Ranking): boolean {
  return (
    ranking.kind === "ranked" &&
    entry.route.risk === null &&
    (entry === ranking.best || entry.standing.kind === "tied")
  );
}
