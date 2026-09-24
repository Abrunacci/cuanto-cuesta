/** The one-line summary of the results, and the shorter text of the bar that keeps it in view. */

import { RATE_FIELDS, REFERENCE_KEY, type Comparison } from "../calculator/index.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney, formatMoneyWhole } from "../text/numbers.ts";
import { fieldId, type FormReading } from "./form.ts";
import { missingInputLabel, missingInputShortLabel } from "./messages.ts";
import { commonMissing } from "./missing.ts";
import { routeNeedsReview } from "./review.ts";

/** A field every route needs: the amount, or the reference price (the MEP). */
export type ReferenceField = "amount" | "reference";

/** The reference fields holding a value that cannot be used. */
export type ReferenceProblems = readonly ReferenceField[];

export function referenceProblems({ problems }: FormReading): ReferenceProblems {
  return [
    ...(problems.has(fieldId.amount) ? (["amount"] as const) : []),
    ...(problems.has(fieldId.price(REFERENCE_KEY)) ? (["reference"] as const) : []),
  ];
}

const REFERENCE_LABELS: Readonly<Record<ReferenceField, { long: string; short: string }>> = {
  amount: { long: "el monto", short: "monto" },
  reference: {
    long: "el dólar MEP",
    short: RATE_FIELDS.find((field) => field.key === REFERENCE_KEY)?.shortLabel ?? REFERENCE_KEY,
  },
};

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
  | {
      readonly kind: "pending";
      readonly text: string;
      /** A few words, for the one-line bar while the keyboard is open: "Falta: monto, MEP". */
      readonly short: string;
    };

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
    const short = problems.map((field) => REFERENCE_LABELS[field].short).join(", ");
    return { kind: "pending", text: reviewText(problems), short: `Revisá: ${short}` };
  }
  const common = commonMissing(comparison);
  if (common.length === 0) {
    return {
      kind: "pending",
      text: "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
      short: "Mirá qué le falta a cada ruta",
    };
  }
  const long = common.map((m) => missingInputLabel(m, feeGaps));
  const short = common.map(missingInputShortLabel);
  return {
    kind: "pending",
    text: `Falta completar: ${joinSpanish(long)}.`,
    short: `Falta: ${short.join(", ")}`,
  };
}

function reviewText(problems: ReferenceProblems): string {
  const verb =
    problems.length > 1
      ? "tienen valores que no se pueden usar"
      : "tiene un valor que no se puede usar";
  const labels = problems.map((field) => REFERENCE_LABELS[field].long);
  return `Revisá ${joinSpanish(labels)}: ${verb}.`;
}
