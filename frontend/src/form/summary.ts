/** The one-line summary of the results, and the shorter text of the bar that keeps it in view. */

import type { Comparison } from "../calculator/index.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney, formatMoneyWhole } from "../text/numbers.ts";
import type { FormReading } from "./form.ts";
import { missingInputLabel } from "./messages.ts";
import { commonMissing } from "./missing.ts";
import { routeNeedsReview } from "./review.ts";

/** Labels of the reference fields holding a value that cannot be used, e.g. ["el dólar MEP"]. */
export type ReferenceProblems = readonly string[];

export function summaryText(
  { atReference, routes }: Comparison,
  problems: ReferenceProblems,
): string {
  if (atReference === null) {
    return problems.length > 0
      ? reviewText(problems)
      : "Completá el monto y el dólar MEP para comparar las rutas.";
  }
  const best = routes[0];
  const reference = `Al dólar MEP serían ${formatMoney(atReference.amount, atReference.currency)}.`;
  if (best?.status !== "complete") {
    return `${reference} Completá las cotizaciones de cada ruta para compararlas.`;
  }
  const { final } = best.result;
  return `${reference} Mejor ruta: ${best.route.name}, llegan ${formatMoney(final.amount, final.currency)}.`;
}

export type BarText =
  | {
      readonly kind: "best";
      readonly route: string;
      readonly routeId: string;
      readonly amount: string;
      /** Whole units, for the one-line bar while the keyboard is open. */
      readonly amountWhole: string;
      /** The result rests on an estimate, a value to set or an unusual price. */
      readonly review: boolean;
    }
  | { readonly kind: "pending"; readonly text: string };

/** What the bar needs to tell whether the best route's result has something to check. */
/** The best route and what reaches the bank; or, while no route can be computed, what is missing. */
export function barText(reading: FormReading, problems: ReferenceProblems): BarText {
  const { comparison, feeGaps } = reading;
  const best = comparison.routes[0];
  if (best?.status === "complete") {
    const { final } = best.result;
    return {
      kind: "best",
      route: best.route.name,
      routeId: best.route.id,
      amount: formatMoney(final.amount, final.currency),
      amountWhole: formatMoneyWhole(final.amount, final.currency),
      review: routeNeedsReview(best.route, reading.unchangedFees, reading.warnings),
    };
  }
  if (problems.length > 0) {
    return { kind: "pending", text: reviewText(problems) };
  }
  const missing = commonMissing(comparison).map((m) => missingInputLabel(m, feeGaps));
  return {
    kind: "pending",
    text:
      missing.length > 0
        ? `Falta completar: ${joinSpanish(missing)}.`
        : "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
  };
}

function reviewText(problems: ReferenceProblems): string {
  const verb =
    problems.length > 1
      ? "tienen valores que no se pueden usar"
      : "tiene un valor que no se puede usar";
  return `Revisá ${joinSpanish(problems)}: ${verb}.`;
}
