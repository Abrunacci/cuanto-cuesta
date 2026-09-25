/** The one-line summary of the results, and the shorter text of the bar that keeps it in view. */

import type { CompleteRoute, Comparison, Ranking, RouteRisk } from "../calculator/index.ts";
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
      return `Por ahora solo se puede calcular ${only.route.name}${riskDetail(only)}: ${arrives(only)}.`;
    }
    case "ranked":
      return [bestText(ranking), ...ranking.above.flatMap(riskyOverText)].join(" ");
    case "risky": {
      const { leader } = ranking;
      return `Por ahora solo se pueden calcular rutas con riesgo: ${leader.route.name}, ${arrives(leader)}${riskDetail(leader)}.`;
    }
  }
}

/** The recommended route: the best without risk, or those tied with it. */
function bestText(ranking: RankedRanking): string {
  const { best } = ranking;
  switch (best.standing.kind) {
    case "ahead": {
      const { by, other } = best.standing;
      return `Mejor ruta: ${best.route.name}, ${arrives(best)}: ${formatMoney(by.amount, by.currency)} más que ${other.name}.`;
    }
    case "tied":
      return `Empatan ${joinSpanish(tiedNames(ranking))}: ${arrives(best)}.`;
    case "unrivaled":
      return `Mejor ruta: ${best.route.name}, ${arrives(best)}.`;
  }
}

/** A risky route that delivers more than the recommended one, and what it risks. */
function riskyOverText(entry: RankedRanking["above"][number]): string[] {
  if (entry.standing.kind !== "over" || entry.route.risk === null) {
    return [];
  }
  const { by } = entry.standing;
  return [
    `${entry.route.name} deja ${formatMoney(by.amount, by.currency)} más, ${entry.route.risk.detail}.`,
  ];
}

/** ", con riesgo de …" for a risky route; nothing for the others. */
function riskDetail({ route }: CompleteRoute): string {
  return route.risk === null ? "" : `, ${route.risk.detail}`;
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

type RankedRanking = Extract<Ranking, { kind: "ranked" }>;

/**
 * The names of the routes without risk that deliver as much as the best one, best first. A risky
 * route tied with it is not among them: it is never recommended.
 */
function tiedNames(ranking: RankedRanking): string[] {
  const tied = ranking.rest.filter((r) => r.standing.kind === "tied" && r.route.risk === null);
  return [ranking.best, ...tied].map((r) => r.route.name);
}

/**
 * The best route; tied routes share the lead; alone, it is the only one computed; risky, every
 * route computed is risky and this one delivers most.
 */
export type BarLead = "best" | "tied" | "alone" | "risky";

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
      /** What the route risks; only a risky route when no route without risk can be computed. */
      readonly risk: RouteRisk | null;
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
      risk: entry.route.risk,
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
interface Lead {
  readonly entry: CompleteRoute;
  readonly kind: BarLead;
  readonly name: string;
}

function leadOf(ranking: Ranking): Lead | null {
  switch (ranking.kind) {
    case "none":
      return null;
    case "alone":
      return { entry: ranking.only, kind: "alone", name: ranking.only.route.name };
    case "ranked":
      return rankedLead(ranking);
    case "risky":
      return { entry: ranking.leader, kind: "risky", name: ranking.leader.route.name };
  }
}

function rankedLead(ranking: RankedRanking): Lead {
  const { best } = ranking;
  switch (best.standing.kind) {
    case "ahead":
    case "unrivaled":
      return { entry: best, kind: "best", name: best.route.name };
    case "tied":
      return { entry: best, kind: "tied", name: joinSpanish(tiedNames(ranking)) };
  }
}
