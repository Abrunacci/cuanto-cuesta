/** The one-line summary of the results, and the shorter text of the bar that keeps it in view. */

import type { CompleteRoute, Comparison, Ranking } from "../calculator/index.ts";
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
  const { ranking } = comparison;
  switch (ranking.kind) {
    case "none":
      return pendingText(comparison, amountHasProblem);
    case "alone": {
      const { only } = ranking;
      return `Por ahora solo se puede calcular ${only.route.name}: ${arrives(only)}.`;
    }
    case "ranked": {
      const { best } = ranking;
      switch (best.standing.kind) {
        case "ahead": {
          const { by, other } = best.standing;
          return `Mejor ruta: ${best.route.name}, ${arrives(best)}: ${formatMoney(by.amount, by.currency)} más que ${other.name}.`;
        }
        case "tied":
          return `Empatan ${joinSpanish(tiedNames(ranking))}: ${arrives(best)}.`;
      }
    }
  }
}

const ALL_FAILED =
  "No se puede calcular ninguna ruta: hay un problema con las cotizaciones o comisiones que usan. No es un error en lo que cargaste.";

/** Every route's own data is wrong: nothing the person types can make one computable. */
function allFailed({ ranking, incomplete, failed }: Comparison): boolean {
  return ranking.kind === "none" && incomplete.length === 0 && failed.length > 0;
}

function pendingText(comparison: Comparison, amountHasProblem: boolean): string {
  if (allFailed(comparison)) {
    return ALL_FAILED;
  }
  if (amountHasProblem) {
    return AMOUNT_PROBLEM;
  }
  if (!commonMissing(comparison).some((missing) => missing.kind === "amount")) {
    return "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.";
  }
  const onlyAmount = comparison.incomplete.some((r) =>
    r.missing.every((missing) => missing.kind === "amount"),
  );
  return onlyAmount
    ? "Completá el monto para comparar las rutas."
    : "Completá el monto y las cotizaciones para comparar las rutas.";
}

function arrives({ result }: CompleteRoute): string {
  return `llegan ${formatMoney(result.final.amount, result.final.currency)}`;
}

/** The names of the routes that deliver as much as the best one, best first. */
function tiedNames(ranking: Extract<Ranking, { kind: "ranked" }>): string[] {
  const tied = ranking.rest.filter((r) => r.standing.kind === "tied");
  return [ranking.best, ...tied].map((r) => r.route.name);
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
  const lead = leadOf(comparison.ranking);
  if (lead !== null) {
    const { entry } = lead;
    const { final } = entry.result;
    return {
      kind: "best",
      lead: lead.kind,
      route: lead.name,
      routeId: entry.route.id,
      amount: formatMoney(final.amount, final.currency),
      amountWhole: formatMoneyWhole(final.amount, final.currency),
      review: routeNeedsReview(entry.route, reading.ownFees, reading.warnings),
    };
  }
  if (allFailed(comparison)) {
    return { kind: "pending", text: ALL_FAILED, short: "Ninguna ruta se puede calcular" };
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

/** The route the bar shows, how it leads, and the name to show: the tied routes' together. */
function leadOf(
  ranking: Ranking,
): { readonly entry: CompleteRoute; readonly kind: BarLead; readonly name: string } | null {
  switch (ranking.kind) {
    case "none":
      return null;
    case "alone":
      return { entry: ranking.only, kind: "alone", name: ranking.only.route.name };
    case "ranked": {
      const { best } = ranking;
      switch (best.standing.kind) {
        case "ahead":
          return { entry: best, kind: "best", name: best.route.name };
        case "tied":
          return { entry: best, kind: "tied", name: joinSpanish(tiedNames(ranking)) };
      }
    }
  }
}
