/**
 * The texts of the page's language, for the components that render them (`useTexts`), and the
 * lookups of what the screen calls each route, step, price and fee.
 */

import { createContext, useContext } from "react";

import type { Route, RouteRisk, Step } from "../calculator/index.ts";
import { lowerFirst } from "../text/case.ts";
import { en } from "./en.ts";
import { es } from "./es.ts";
import type { Language } from "./language.ts";
import type { FeeTexts, RateTexts, RiskTexts, Texts } from "./texts.ts";

export type { Texts } from "./texts.ts";

const TEXTS: Readonly<Record<Language, Texts>> = { es, en };

export function textsFor(language: Language): Texts {
  return TEXTS[language];
}

export const TextsContext = createContext<Texts>(es);

/** The texts of the page's language. */
export function useTexts(): Texts {
  return useContext(TextsContext);
}

// Every route, step, price and fee has its texts in both languages (`i18n.test.ts` checks), so
// the ids these fall back to are never shown.

export function routeName(t: Texts, route: Route): string {
  return t.routes[route.id]?.name ?? route.id;
}

export function routeWarnings(t: Texts, route: Route): readonly string[] {
  return t.routes[route.id]?.warnings ?? [];
}

export function stepLabel(t: Texts, id: string): string {
  return t.steps[id] ?? id;
}

export function riskTexts(t: Texts, risk: RouteRisk): RiskTexts {
  return t.risks[risk];
}

export function rateTexts(t: Texts, key: string): RateTexts {
  return t.rates[key] ?? { label: key, shortLabel: key, help: "", unit: "" };
}

export function feeTexts(t: Texts, id: string): FeeTexts {
  return t.fees[id] ?? { label: id, note: null };
}

/** A fee's name as it reads inside a sentence: "recargo P2P…". */
export function feeInSentence(t: Texts, id: string): string {
  return lowerFirst(feeTexts(t, id).label);
}

/** A price's name as it reads inside a sentence: "dólar MEP (compra)". */
export function rateInSentence(t: Texts, key: string): string {
  return lowerFirst(rateTexts(t, key).label);
}

/**
 * A step whose only content is one fee field named like the step ("Retirar de Payoneer a…" and
 * "Retiro de Payoneer a…"): its title would repeat the fee's, so it is only kept for screen
 * readers. `here` are the step's fees whose fields this card holds.
 */
export function stepRepeatsItsFee(t: Texts, step: Step, here: readonly string[]): boolean {
  const [id] = here;
  if (
    step.conversion !== null ||
    step.feeIds.length !== 1 ||
    here.length !== 1 ||
    id === undefined
  ) {
    return false;
  }
  return withoutFirstWord(feeTexts(t, id).label) === withoutFirstWord(stepLabel(t, step.id));
}

function withoutFirstWord(text: string): string {
  return text.toLowerCase().split(" ").slice(1).join(" ");
}
