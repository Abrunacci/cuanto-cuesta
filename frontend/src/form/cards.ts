/**
 * Which route card holds each fee's field. Routes can share a fee (the two Binance routes share
 * the Bitso leg): its field is shown once, in the first route that uses it, so the page never
 * holds two fields with the same id. The other routes' cards link there.
 */

import { ROUTES, type Route } from "../calculator/index.ts";

/** The route whose card holds this fee's field: the first one that uses the fee. */
export function cardOf(feeId: string): Route | undefined {
  return ROUTES.find((route) => route.steps.some((step) => step.feeIds.includes(feeId)));
}
