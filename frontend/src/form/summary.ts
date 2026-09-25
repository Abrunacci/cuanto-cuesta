/** The one-line summary of the results, and the shorter text of the bar that keeps it in view. */

import type { CompleteRoute, Comparison } from "../calculator/index.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney, formatMoneyWhole } from "../text/numbers.ts";
import { fieldId, type FormReading } from "./form.ts";
import { missingInputLabel, missingInputShortLabel } from "./messages.ts";
import { commonMissing } from "./missing.ts";
import { routeNeedsReview } from "./review.ts";

/** Whether the amount holds a value that cannot be used; every route needs it. */
export function hasAmountProblem({ problems }: FormReading): boolean {
  return problems.has(fieldId.amount);
}

const AMOUNT_PROBLEM = "Revisá el monto: tiene un valor que no se puede usar.";

export function summaryText(comparison: Comparison, amountHasProblem: boolean): string {
  const best = comparison.routes[0];
  if (best?.status !== "complete") {
    if (amountHasProblem) {
      return AMOUNT_PROBLEM;
    }
    if (!commonMissing(comparison).some((missing) => missing.kind === "amount")) {
      return "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.";
    }
    const onlyAmount = comparison.routes.some(
      (r) => r.status === "incomplete" && r.missing.every((missing) => missing.kind === "amount"),
    );
    return onlyAmount
      ? "Completá el monto para comparar las rutas."
      : "Completá el monto y las cotizaciones para comparar las rutas.";
  }
  const { final } = best.result;
  const arrives = `llegan ${formatMoney(final.amount, final.currency)}`;
  switch (best.standing.kind) {
    case "ahead": {
      const { by, other } = best.standing;
      return `Mejor ruta: ${best.route.name}, ${arrives}: ${formatMoney(by.amount, by.currency)} más que ${other.name}.`;
    }
    case "tied":
      return `Empatan ${joinSpanish(tiedNames(comparison, best))}: ${arrives}.`;
    case "alone":
      return `Por ahora solo se puede calcular ${best.route.name}: ${arrives}.`;
    case "behind":
      throw new Error(`The best route, ${best.route.id}, cannot be behind another one`);
  }
}

/** The names of the routes that deliver as much as the best one, best first. */
function tiedNames(comparison: Comparison, best: CompleteRoute): string[] {
  return comparison.routes
    .filter((r) => r.status === "complete" && r.result.final.amount.eq(best.result.final.amount))
    .map((r) => r.route.name);
}

/** The best route; tied routes share the lead; alone, it is the only one computed. */
export type BarLead = "best" | "tied" | "alone";

export type BarText =
  | {
      readonly kind: "best";
      readonly lead: BarLead;
      /** Its name, or the tied routes' names joined. */
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
export function barText(reading: FormReading, amountHasProblem: boolean): BarText {
  const { comparison, feeGaps } = reading;
  const best = comparison.routes[0];
  if (best?.status === "complete") {
    const { final } = best.result;
    const lead = barLead(best);
    return {
      kind: "best",
      lead,
      route: lead === "tied" ? joinSpanish(tiedNames(comparison, best)) : best.route.name,
      routeId: best.route.id,
      amount: formatMoney(final.amount, final.currency),
      amountWhole: formatMoneyWhole(final.amount, final.currency),
      review: routeNeedsReview(best.route, reading.ownFees, reading.warnings),
    };
  }
  if (amountHasProblem) {
    return { kind: "pending", text: AMOUNT_PROBLEM, short: "Revisá: monto" };
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

function barLead(best: CompleteRoute): BarLead {
  switch (best.standing.kind) {
    case "ahead":
      return "best";
    case "behind":
      throw new Error(`The best route, ${best.route.id}, cannot be behind another one`);
    case "tied":
      return "tied";
    case "alone":
      return "alone";
  }
}
