import type { Route } from "../calculator/index.ts";
import { feesToReview } from "../form/review.ts";

/** Ids of the places in the result the page takes the person to. */

export const RESULTS_TITLE_ID = "results-title";

/** The id of a route's heading in the result. */
export const routeResultId = (routeId: string) => `result-${routeId}`;

/** The id of the line that opens a route's review list in the result. */
export const routeReviewId = (routeId: string) => `review-${routeId}`;

/**
 * Where "revisá" takes the person for a route: its review list when it has fees to check, else
 * its heading, under which the unusual prices it was computed with are listed.
 */
export function reviewTargetId(route: Route, ownFees: ReadonlySet<string>): string {
  const { toSet, estimated } = feesToReview(route, ownFees);
  return toSet.length > 0 || estimated.length > 0
    ? routeReviewId(route.id)
    : routeResultId(route.id);
}
