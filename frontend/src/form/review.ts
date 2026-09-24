/**
 * What to check before trusting a route's result: fees still at a value the person must set
 * (user-defined, at their neutral default) and estimated fees still at the researched value.
 */

import {
  FEE_DEFAULTS,
  RATE_FIELDS,
  REFERENCE_KEY,
  type FeeDefault,
  type Route,
} from "../calculator/index.ts";
import { lowerFirst } from "../text/case.ts";
import { fieldId } from "./form.ts";

export interface FeesToReview {
  readonly toSet: readonly FeeDefault[];
  readonly estimated: readonly FeeDefault[];
}

export function feesToReview(route: Route, unchangedFees: ReadonlySet<string>): FeesToReview {
  const unchanged = route.steps
    .flatMap((step) => step.feeIds)
    .filter((id) => unchangedFees.has(id))
    .map((id) => FEE_DEFAULTS.find((d) => d.fee.id === id))
    .filter((d) => d !== undefined);
  return {
    toSet: unchanged.filter((d) => d.provenance.kind === "user_defined"),
    estimated: unchanged.filter((d) => d.provenance.kind === "estimate"),
  };
}

/** Labels of the unusual prices a route's result depends on: its conversions and the MEP. */
export function unusualPrices(route: Route, warnings: ReadonlyMap<string, string>): string[] {
  const keys = new Set([
    ...route.steps.flatMap((step) => (step.conversion !== null ? [step.conversion.rateKey] : [])),
    REFERENCE_KEY,
  ]);
  return RATE_FIELDS.filter(
    (field) => keys.has(field.key) && warnings.has(fieldId.price(field.key)),
  ).map((field) => lowerFirst(field.label));
}

/** Whether a route's result rests on something to check: an estimate, a 0 to set, an odd price. */
export function routeNeedsReview(
  route: Route,
  unchangedFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): boolean {
  const { toSet, estimated } = feesToReview(route, unchangedFees);
  return toSet.length > 0 || estimated.length > 0 || unusualPrices(route, warnings).length > 0;
}
