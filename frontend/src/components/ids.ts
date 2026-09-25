/** Ids of the places in the result the page takes the person to. */

export const RESULTS_TITLE_ID = "results-title";

/** The id of a route's heading in the result. */
export const routeResultId = (routeId: string) => `result-${routeId}`;

/** The id of the line that opens a route's review list in the result. */
export const routeReviewId = (routeId: string) => `review-${routeId}`;

/** Where "revisá" takes the person for a route: its review list, or else its heading. */
export const reviewTargetId = (routeId: string, opensList: boolean) =>
  opensList ? routeReviewId(routeId) : routeResultId(routeId);
