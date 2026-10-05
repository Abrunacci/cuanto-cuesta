/**
 * Everything the screen says, as one object per language (`es.ts`, `en.ts`) with this shape, so
 * TypeScript fails the build when a language is missing a text. A text that depends on values
 * is a function that takes them already formatted: the language files only hold words.
 *
 * Routes, steps, prices and fees are data with ids (`src/calculator/data`); their names are here,
 * by id. `i18n.test.ts` checks that both languages name every one.
 */

import type { BarLead } from "../form/summary.ts";
import type { RouteRisk } from "../calculator/index.ts";
import type { ClosedNote } from "../quotes/freshness.ts";
import type { Numbers } from "../text/numbers.ts";
import type { Language } from "./language.ts";

export interface RouteTexts {
  readonly name: string;
  /** Shown under the route's result; a "[phrase](url)" renders as a link. */
  readonly warnings: readonly string[];
}

export interface RiskTexts {
  /**
   * A few words next to the route's name: "Riesgo de bloqueo". It holds `mark`: the phone's bar
   * shows only that word and has the label read out, and what is seen must be in what is heard.
   */
  readonly label: string;
  /** The word the phone's bar shows: "riesgo". */
  readonly mark: string;
  /** Said after what the route delivers: "con riesgo de bloqueo de tu cuenta de Binance". */
  readonly detail: string;
}

export interface RateTexts {
  readonly label: string;
  /** A word or two, where there is room for little: "MEP". */
  readonly shortLabel: string;
  /** Where to find this price, in a line. */
  readonly help: string;
  /** How the price reads after a number: "ARS por USD". */
  readonly unit: string;
}

export interface FeeTexts {
  readonly label: string;
  /** What the research found; a bare URL renders as a link. */
  readonly note: string | null;
}

export interface Texts {
  readonly language: Language;
  /** Reading and writing numbers the way this language does. */
  readonly numbers: Numbers;
  /** "a", "a y b", "a, b y c". */
  readonly list: (items: readonly string[]) => string;
  /** What goes before item `index` of `count` in such a list: "", ", " or " y ". */
  readonly listSeparator: (index: number, count: number) => string;

  readonly page: {
    readonly lead: string;
    /** The page's description for search engines and link previews. */
    readonly description: string;
    /** The language selector's name. */
    readonly languageGroup: string;
    /** A link's name when it opens in another tab. */
    readonly newTab: (label: string) => string;
    readonly feesTitle: string;
    readonly feesIntro: string;
  };

  readonly inputs: {
    readonly title: string;
    /** How to type numbers, and what is remembered; `prefilled` when a price came prefilled. */
    readonly intro: (prefilled: boolean) => string;
    readonly amountLabel: string;
    readonly amountHelp: string;
    readonly amountPlaceholder: string;
  };

  readonly routes: Readonly<Record<string, RouteTexts>>;
  readonly steps: Readonly<Record<string, string>>;
  readonly risks: Readonly<Record<RouteRisk, RiskTexts>>;
  readonly rates: Readonly<Record<string, RateTexts>>;
  readonly fees: Readonly<Record<string, FeeTexts>>;

  /** Why a typed value cannot be used, or looks wrong. Values come formatted. */
  readonly problems: {
    readonly notANumber: string;
    readonly notPositive: string;
    readonly tooManyDecimals: (max: number) => string;
    readonly tooLarge: (max: string) => string;
    readonly negative: string;
    readonly aboveCap: (cap: string, unit: string) => string;
    readonly unusualPrice: (value: string, unit: string, min: string, max: string) => string;
    readonly didYouMean: (value: string) => string;
    /** How an ambiguous value was read: "Leímos 1.030,00 ARS por USD." */
    readonly read: (value: string, unit: string) => string;
  };

  /** What a route is missing, as it reads inside a list. */
  readonly missing: {
    readonly amount: string;
    /** Where there is room for little. */
    readonly amountShort: string;
    readonly feeMinimum: (fee: string) => string;
    readonly feeAndMinimum: (fee: string) => string;
  };

  /** A fee's badge. */
  readonly feeStatus: {
    readonly verified: string;
    readonly estimate: string;
    readonly userDefined: string;
    readonly own: string;
  };

  /** The researched value of a fee, minimum included: "1 %, mínimo 5 USD". */
  readonly referenceValue: (value: string, minimum: string | null) => string;

  /** The one-line summary of the results. Names, amounts and details come ready to use. */
  readonly summary: {
    readonly amountProblem: string;
    readonly allFailed: string;
    readonly noneYet: string;
    readonly completeAmount: string;
    readonly completeAmountAndRates: string;
    /** Said after a route's name when it was computed with an estimated price. */
    readonly estimateMark: string;
    readonly alone: (route: string, arrives: string) => string;
    readonly best: (route: string, arrives: string, by: string, other: string) => string;
    readonly unrivaled: (route: string, arrives: string) => string;
    readonly tied: (routes: string, arrives: string) => string;
    readonly risky: (route: string, arrives: string, risk: string) => string;
    readonly riskyOver: (route: string, by: string, risk: string) => string;
    readonly arrives: (amount: string) => string;
  };

  /** The phone's bar at the bottom of the screen. */
  readonly bar: {
    readonly name: string;
    readonly leads: Readonly<Record<BarLead, { readonly full: string; readonly short: string }>>;
    readonly arrives: (amount: string) => string;
    readonly estimated: string;
    readonly estimatedShort: string;
    readonly seeResult: string;
    readonly allFailed: string;
    readonly amountProblem: string;
    readonly noneYet: string;
    readonly missing: (list: string) => string;
    readonly missingShort: (list: string) => string;
  };

  readonly results: {
    readonly title: string;
    readonly missingTitle: string;
    readonly routeMissingDone: string;
    readonly failedRoute: string;
    readonly arrives: string;
    readonly fees: string;
    readonly difference: string;
    readonly aloneDifference: string;
    readonly unrivaledDifference: string;
    readonly more: (other: string) => string;
    readonly less: (other: string) => string;
    readonly same: (other: string) => string;
    readonly review: string;
    readonly reviewLabel: (route: string) => string;
    readonly unusual: (prices: string) => string;
    readonly exhausted: string;
    readonly attention: string;
    readonly estimateBadge: string;
  };

  /** What to check in a route before trusting its result. */
  readonly review: {
    readonly valuesToSet: (count: number) => string;
    readonly estimatedFees: (count: number) => string;
    readonly unusualPrices: (count: number) => string;
    readonly whatToCheck: (parts: string) => string;
    readonly ownFees: (count: number) => string;
    /** After the fee's link: ": está en 0 %, poné tu valor." */
    readonly toSet: (value: string) => string;
    /** Around the estimated fees' links, for one fee or several. */
    readonly estimated: (count: number) => { readonly before: string; readonly after: string };
    readonly own: string;
  };

  /** A route's card of fees. */
  readonly cards: {
    readonly adjust: string;
    readonly ownCount: (count: number) => string;
    readonly convertsWith: (rate: string) => string;
    readonly setElsewhere: (count: number) => string;
    readonly details: string;
    readonly detailsLabel: (status: string, fee: string) => string;
    readonly ownValue: (reference: string) => string;
    readonly backToReference: string;
    readonly backToReferenceLabel: (fee: string) => string;
    readonly minimumLabel: (fee: string) => string;
    readonly minimumHelp: string;
  };

  /** Where a fee's researched value comes from. */
  readonly provenance: {
    readonly verified: (date: string) => string;
    readonly reviewed: (date: string) => string;
    readonly upperBound: string;
    readonly source: string;
    readonly sourceOf: (fee: string) => string;
    readonly reference: string;
    readonly referenceOf: (fee: string) => string;
    /** "2026-09-23" as this language writes dates. */
    readonly date: (isoDate: string) => string;
  };

  readonly reset: {
    readonly button: string;
    readonly question: (count: number) => string;
    readonly confirm: string;
    readonly cancel: string;
    readonly done: string;
  };

  /** About the prices that come prefilled. */
  readonly quotes: {
    /** How old a price is: "2 h 10 min", "1 día". */
    readonly age: (milliseconds: number) => string;
    /** Under a price that may be old; `key` says where to check it. */
    readonly stale: (age: string, key: string) => string;
    /** Under the MEP outside market hours. */
    readonly closed: (note: ClosedNote) => string;
    /** Under the card's empty field, while the comparison uses its estimate. */
    readonly cardField: (value: string, age: string | null) => string;
    /** Next to the "Precio estimado" mark, in the route's result. */
    readonly cardResult: (value: string, age: string | null) => string;
  };
}
