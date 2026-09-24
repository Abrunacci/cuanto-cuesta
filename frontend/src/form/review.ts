/**
 * What to check before trusting a route's result: fees still at a value the person must set
 * (user-defined, at their neutral default) and estimated fees still at the researched value.
 */

import { FEE_DEFAULTS, type FeeDefault, type Route } from "../calculator/index.ts";

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
