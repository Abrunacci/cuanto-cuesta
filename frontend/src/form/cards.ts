/**
 * Which route card holds each fee's field. Routes can share a fee (the two Binance routes share
 * the Bitso leg): its field is shown once, in the first route that uses it, so the page never
 * holds two fields with the same id. The other routes' cards link there.
 */

import { ROUTES, type Route } from "../calculator/index.ts";

/** The route whose card holds this fee's field: the first one that uses the fee. */
export function cardOf(feeId: string, routes: readonly Route[] = ROUTES): Route | undefined {
  return routes.find((route) => route.steps.some((step) => step.feeIds.includes(feeId)));
}

/** Fees grouped by the card that holds their fields, in the order they first appear. */
export interface CardGroup {
  readonly card: Route;
  readonly feeIds: readonly [string, ...string[]];
}

export function byCard(feeIds: readonly string[], routes: readonly Route[] = ROUTES): CardGroup[] {
  const groups: CardGroup[] = [];
  for (const id of feeIds) {
    const card = cardOf(id, routes);
    if (card === undefined) {
      continue;
    }
    const index = groups.findIndex((group) => group.card === card);
    const group = groups[index];
    if (group === undefined) {
      groups.push({ card, feeIds: [id] });
    } else {
      groups[index] = { card, feeIds: [...group.feeIds, id] };
    }
  }
  return groups;
}

/** How many of the fields this route's card holds are the person's own. */
export function ownFieldsIn(
  route: Route,
  ownFees: ReadonlySet<string>,
  routes: readonly Route[] = ROUTES,
): number {
  return route.steps
    .flatMap((step) => step.feeIds)
    .filter((id) => ownFees.has(id) && cardOf(id, routes)?.id === route.id).length;
}
