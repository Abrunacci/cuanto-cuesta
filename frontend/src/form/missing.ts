/** What routes are missing, and which of it every route is missing. */

import type { Comparison, MissingInput } from "../calculator/index.ts";
import { fieldId, type FeeGap } from "./form.ts";

/** One key per input, to compare missing inputs across routes. */
export function missingKey(missing: MissingInput): string {
  switch (missing.kind) {
    case "amount":
      return "amount";
    case "rate":
      return `rate:${missing.key}`;
    case "fee":
      return `fee:${missing.id}`;
  }
}

/** The field to fill for a missing input: for a fee, its value or its minimum. */
export function missingFieldId(
  missing: MissingInput,
  feeGaps: ReadonlyMap<string, FeeGap>,
): string {
  switch (missing.kind) {
    case "amount":
      return fieldId.amount;
    case "rate":
      return fieldId.price(missing.key);
    case "fee":
      return feeGaps.get(missing.id) === "minimum"
        ? fieldId.minimum(missing.id)
        : fieldId.fee(missing.id);
  }
}

/**
 * What every route is missing, in the order the first route lists it; empty as soon as one route
 * can be computed. Shown once instead of repeated under each route.
 */
export function commonMissing(comparison: Comparison): MissingInput[] {
  const [first, ...rest] = comparison.routes;
  if (first?.status !== "incomplete" || rest.some((r) => r.status !== "incomplete")) {
    return [];
  }
  return first.missing.filter((missing) =>
    rest.every(
      (r) =>
        r.status === "incomplete" && r.missing.some((m) => missingKey(m) === missingKey(missing)),
    ),
  );
}
