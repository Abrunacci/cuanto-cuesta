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
    .map((id) => FEE_DEFAULTS.find((d) => d.fee.id === id))
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
export function reviewSummary({ toSet, estimated, own }: FeesToReview): string | null {
  const parts = [
    ...(toSet.length > 0 ? [count(toSet.length, "valor para poner", "valores para poner")] : []),
    ...(estimated.length > 0
      ? [count(estimated.length, "comisión estimada", "comisiones estimadas")]
      : []),
  ];
  if (parts.length > 0) {
    return `Qué revisar: ${joinSpanish(parts)}`;
  }
  if (own.length > 0) {
    return `Con tu valor: ${count(own.length, "comisión", "comisiones")}`;
  }
  return null;
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

/**
 * A route's difference figure: nothing to compare with, or how the route stands and the route
 * whose values to check before trusting it (null when none).
 */
export type Difference =
  | { readonly kind: "alone" }
  | {
      readonly kind: "compared";
      readonly standing: Ahead | Behind | Tied;
      readonly review: Route | null;
    };

export function difference(
  entry: CompleteRoute,
  ownFees: ReadonlySet<string>,
  warnings: ReadonlyMap<string, string>,
): Difference {
  const { standing } = entry;
  return standing.kind === "alone"
    ? { kind: "alone" }
    : {
        kind: "compared",
        standing,
        review: differenceToReview(entry.route, standing, ownFees, warnings),
      };
}
