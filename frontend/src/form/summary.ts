/** The one-line summary of the results, and the shorter text of the bar that keeps it in view. */

import type { CompleteRoute, Comparison, Ranking, RouteRisk } from "../calculator/index.ts";
import { riskTexts, routeName, type Texts } from "../i18n/index.ts";
import { fieldId, type FormReading } from "./form.ts";
import { missingInputLabel, missingInputShortLabel } from "./messages.ts";
import { commonMissing } from "./missing.ts";
import { routeNeedsReview, routeUsesEstimate } from "./review.ts";

/** Whether the amount holds a value that cannot be used; every route needs it. */
export function hasAmountProblem({ problems }: FormReading): boolean {
  return problems.has(fieldId.amount);
}

/**
 * `estimated` holds the keys of the prices taken from an estimate (the card's, while its field is
 * empty): a lead computed with one says so, since the figure is not the person's own yet.
 */
export function summaryText(
  t: Texts,
  comparison: Comparison,
  amountHasProblem: boolean,
  estimated: ReadonlySet<string> = new Set(),
): string {
  const { ranking } = comparison;
  const { summary } = t;
  /** The route's name, with what it risks and whether it used an estimate. */
  const named = (entry: CompleteRoute, withRisk: boolean) =>
    `${routeName(t, entry.route)}${withRisk ? riskDetail(t, entry) : ""}${estimateMark(t, [entry], estimated)}`;
  switch (ranking.kind) {
    case "none":
      return pendingText(t, comparison, amountHasProblem);
    case "alone":
      return summary.alone(named(ranking.only, true), arrives(t, ranking.only));
    case "ranked":
      return [
        bestText(t, ranking, estimated),
        ...ranking.above.flatMap((e) => riskyOverText(t, e)),
      ].join(" ");
    case "unrivaled":
      return [
        summary.unrivaled(named(ranking.best, false), arrives(t, ranking.best)),
        ...ranking.above.flatMap((entry) => riskyOverText(t, entry)),
      ].join(" ");
    case "risky": {
      const { leader } = ranking;
      return summary.risky(
        named(leader, false),
        arrives(t, leader),
        leader.route.risk === null ? "" : riskTexts(t, leader.route.risk).detail,
      );
    }
  }
}

/** The recommended route: the best without risk, or those tied with it. */
function bestText(t: Texts, ranking: RankedRanking, estimated: ReadonlySet<string>): string {
  const { best } = ranking;
  switch (best.standing.kind) {
    case "ahead": {
      const { by, other } = best.standing;
      return t.summary.best(
        `${routeName(t, best.route)}${estimateMark(t, [best], estimated)}`,
        arrives(t, best),
        t.numbers.money(by.amount, by.currency),
        routeName(t, other),
      );
    }
    case "tied":
      return t.summary.tied(
        `${t.list(tiedNames(t, ranking))}${estimateMark(t, tiedEntries(ranking), estimated)}`,
        arrives(t, best),
      );
  }
}

/** ", con precio estimado" when any of these routes was computed with an estimated price. */
function estimateMark(
  t: Texts,
  entries: readonly CompleteRoute[],
  estimated: ReadonlySet<string>,
): string {
  return entries.some(({ route }) => routeUsesEstimate(route, estimated))
    ? t.summary.estimateMark
    : "";
}

/** A risky route that delivers more than the recommended one, and what it risks. */
function riskyOverText(t: Texts, entry: RankedRanking["above"][number]): string[] {
  if (entry.standing.kind !== "over" || entry.route.risk === null) {
    return [];
  }
  const { by } = entry.standing;
  return [
    t.summary.riskyOver(
      routeName(t, entry.route),
      t.numbers.money(by.amount, by.currency),
      riskTexts(t, entry.route.risk).detail,
    ),
  ];
}

/** ", con riesgo de …" for a risky route; nothing for the others. */
function riskDetail(t: Texts, { route }: CompleteRoute): string {
  return route.risk === null ? "" : `, ${riskTexts(t, route.risk).detail}`;
}

/** Every route's own data is wrong: nothing the person types can make one computable. */
function allFailed({ ranking, incomplete, failed }: Comparison): boolean {
  return ranking.kind === "none" && incomplete.length === 0 && failed.length > 0;
}

function pendingText(t: Texts, comparison: Comparison, amountHasProblem: boolean): string {
  const { summary } = t;
  if (allFailed(comparison)) {
    return summary.allFailed;
  }
  if (amountHasProblem) {
    return summary.amountProblem;
  }
  if (!commonMissing(comparison).some((missing) => missing.kind === "amount")) {
    return summary.noneYet;
  }
  const onlyAmount = comparison.incomplete.some((r) =>
    r.missing.every((missing) => missing.kind === "amount"),
  );
  return onlyAmount ? summary.completeAmount : summary.completeAmountAndRates;
}

function arrives(t: Texts, { result }: CompleteRoute): string {
  return t.summary.arrives(t.numbers.money(result.final.amount, result.final.currency));
}

type RankedRanking = Extract<Ranking, { kind: "ranked" }>;

/**
 * The names of the routes without risk that deliver as much as the best one, best first. A risky
 * route tied with it is not among them: it is never recommended.
 */
function tiedNames(t: Texts, ranking: RankedRanking): string[] {
  return tiedEntries(ranking).map((r) => routeName(t, r.route));
}

function tiedEntries(ranking: RankedRanking): CompleteRoute[] {
  const tied = ranking.rest.filter((r) => r.standing.kind === "tied" && r.route.risk === null);
  return [ranking.best, ...tied];
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
      /** The result rests on an estimated fee, a value to set or an unusual price. */
      readonly review: boolean;
      /** Computed with an estimated price (the card's, while its field is empty). */
      readonly estimated: boolean;
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
export function barText(t: Texts, reading: FormReading, amountHasProblem: boolean): BarText {
  const { comparison, feeGaps } = reading;
  const { bar, summary, numbers } = t;
  const lead = leadOf(t, comparison.ranking);
  if (lead !== null) {
    const { entry } = lead;
    const { final } = entry.result;
    return {
      kind: "best",
      lead: lead.kind,
      route: lead.name,
      routeId: entry.route.id,
      amount: numbers.money(final.amount, final.currency),
      amountWhole: numbers.moneyWhole(final.amount, final.currency),
      review: routeNeedsReview(entry.route, reading.ownFees, reading.warnings),
      estimated: lead.entries.some(({ route }) => routeUsesEstimate(route, reading.estimated)),
      risk: entry.route.risk,
    };
  }
  if (allFailed(comparison)) {
    return { kind: "pending", text: summary.allFailed, short: bar.allFailed };
  }
  if (amountHasProblem) {
    return { kind: "pending", text: summary.amountProblem, short: bar.amountProblem };
  }
  const common = commonMissing(comparison);
  if (common.length === 0) {
    return { kind: "pending", text: summary.noneYet, short: bar.noneYet };
  }
  const long = common.map((m) => missingInputLabel(t, m, feeGaps));
  const short = common.map((m) => missingInputShortLabel(t, m));
  return {
    kind: "pending",
    text: bar.missing(t.list(long)),
    short: bar.missingShort(short.join(", ")),
  };
}

/** The route the bar shows, how it leads, and the name to show: the tied routes' together. */
interface Lead {
  readonly entry: CompleteRoute;
  /** Every route the bar names: the tied ones, or just `entry`. */
  readonly entries: readonly CompleteRoute[];
  readonly kind: BarLead;
  readonly name: string;
}

function leadOf(t: Texts, ranking: Ranking): Lead | null {
  switch (ranking.kind) {
    case "none":
      return null;
    case "alone":
      return single(t, ranking.only, "alone");
    case "ranked":
      return rankedLead(t, ranking);
    case "unrivaled":
      return single(t, ranking.best, "best");
    case "risky":
      return single(t, ranking.leader, "risky");
  }
}

function rankedLead(t: Texts, ranking: RankedRanking): Lead {
  const { best } = ranking;
  switch (best.standing.kind) {
    case "ahead":
      return single(t, best, "best");
    case "tied":
      return {
        entry: best,
        entries: tiedEntries(ranking),
        kind: "tied",
        name: t.list(tiedNames(t, ranking)),
      };
  }
}

function single(t: Texts, entry: CompleteRoute, kind: BarLead): Lead {
  return { entry, entries: [entry], kind, name: routeName(t, entry.route) };
}
