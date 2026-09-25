/**
 * What to check before trusting a route's result: fees the person has not set yet that hold a
 * value they must set (user-defined, at their neutral default) or an estimate. Fees the person
 * set are theirs to trust.
 */

import {
  FEE_DEFAULTS,
  RATE_FIELDS,
  type Ahead,
  type Behind,
  type FeeDefault,
  type Route,
  type Tied,
} from "../calculator/index.ts";
import { lowerFirst } from "../text/case.ts";
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
    .map((id) => FEE_DEFAULTS.find((d) => d.fee.id === id))
    .filter((d) => d !== undefined);
  const reference = fees.filter((d) => !ownFees.has(d.fee.id));
  return {
    toSet: reference.filter((d) => d.provenance.kind === "user_defined"),
    estimated: reference.filter((d) => d.provenance.kind === "estimate"),
    own: fees.filter((d) => ownFees.has(d.fee.id)),
  };
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
  const { toSet, estimated } = feesToReview(route, ownFees);
  return toSet.length > 0 || estimated.length > 0 || unusualPrices(route, warnings).length > 0;
}

/**
 * The route to check before trusting a route's difference, which rests on both routes compared:
 * the other one when it needs review (what the route itself needs is listed under it), else the
 * route itself; null when neither does.
 */
export function differenceToReview(
  route: Route,
  standing: Ahead | Behind | Tied,
  ownFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): Route | null {
  if (routeNeedsReview(standing.other, ownFees, warnings)) {
    return standing.other;
  }
  return routeNeedsReview(route, ownFees, warnings) ? route : null;
}
