/**
 * What the screen says about the prices that come from the backend. Under a fresh price, nothing:
 * something shows only when the price needs a second look (it may be old, or the latest reading
 * jumped far from it), or when the MEP is the last close.
 */

import { type PositivePrice } from "../calculator/index.ts";
import { rateTexts, type Texts } from "../i18n/index.ts";
import type { Numbers } from "../text/numbers.ts";
import { closedNote, freshness } from "./freshness.ts";
import { CARD_KEY, type Quote, type RatesSnapshot } from "./quotes.ts";

/** Under a prefilled field: a warning to check it, or a plain note. */
export interface FieldNotice {
  readonly kind: "warning" | "note";
  readonly text: string;
}

/** The card's estimate, used while its field is empty. */
export interface CardEstimate {
  readonly key: string;
  readonly price: PositivePrice;
  /** Under the card's field. */
  readonly fieldNote: string;
  /** Next to the "Precio estimado" mark, in the route's result. */
  readonly resultNote: string;
}

/**
 * The text to prefill each field with, by rate key, as the person would type it; the card's field
 * is never prefilled.
 */
export function prefillTexts(
  numbers: Numbers,
  snapshot: RatesSnapshot,
): Readonly<Record<string, string>> {
  const texts: Record<string, string> = {};
  for (const [key, quote] of snapshot.quotes) {
    if (key !== CARD_KEY) {
      texts[key] = numbers.exact(quote.price);
    }
  }
  return texts;
}

export function fieldNotice(t: Texts, quote: Quote, now: number): FieldNotice | null {
  // Before its age: a price the latest reading contradicts needs a look whatever its age.
  if (quote.held !== null) {
    return { kind: "warning", text: t.quotes.held(t.numbers.exact(quote.held.price), quote.key) };
  }
  const state = freshness(quote.key, quote.observedAt, now);
  switch (state.kind) {
    case "fresh":
      return null;
    case "closed":
      return {
        kind: "note",
        text: t.quotes.closed(closedNote(state.observedAt, state.opens, now)),
      };
    case "stale":
      return { kind: "warning", text: t.quotes.stale(t.quotes.age(state.age), quote.key) };
  }
}

export function cardEstimate(t: Texts, snapshot: RatesSnapshot, now: number): CardEstimate | null {
  const quote = snapshot.quotes.get(CARD_KEY);
  if (quote?.estimatedFinal == null) {
    return null;
  }
  const state = freshness(CARD_KEY, quote.observedAt, now);
  const age = state.kind === "stale" ? t.quotes.age(state.age) : null;
  const { unit } = rateTexts(t, CARD_KEY);
  const value = `${t.numbers.exact(quote.estimatedFinal)} ${unit}`;
  // Only the estimate is used, so only a held estimate is worth a word.
  const heldEstimate = quote.held?.estimatedFinal ?? null;
  const held = heldEstimate === null ? null : `${t.numbers.exact(heldEstimate)} ${unit}`;
  return {
    key: CARD_KEY,
    price: quote.estimatedFinal,
    fieldNote: t.quotes.cardField(value, age, held),
    resultNote: t.quotes.cardResult(value, age, held),
  };
}
