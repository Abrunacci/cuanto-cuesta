/**
 * What the screen says about the prices that come from the backend. Under a fresh price, nothing:
 * something shows only when the price needs a second look, or when the MEP is the last close.
 */

import { type PositivePrice } from "../calculator/index.ts";
import { PRICE_CHECKS } from "../form/plausible.ts";
import { formatExact } from "../text/numbers.ts";
import { ageText, closedText, freshness } from "./freshness.ts";
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

/** Where to check each price, after "Revisalo". */
const WHERE: Readonly<Record<string, string>> = {
  mep: "en tu banco o broker",
  binance_p2p_usdt_usd: "en Binance P2P",
  bitso_usdt_ars: "en Bitso",
  arq_usd_ars: "en ARQ",
};

/** The text to prefill each field with, by rate key; the card's field is never prefilled. */
export function prefillTexts(snapshot: RatesSnapshot): Readonly<Record<string, string>> {
  const texts: Record<string, string> = {};
  for (const [key, quote] of snapshot.quotes) {
    if (key !== CARD_KEY) {
      texts[key] = formatExact(quote.price);
    }
  }
  return texts;
}

export function fieldNotice(quote: Quote, now: number): FieldNotice | null {
  const state = freshness(quote.key, quote.observedAt, now);
  switch (state.kind) {
    case "fresh":
      return null;
    case "closed":
      return { kind: "note", text: closedText(state.observedAt, state.opens, now) };
    case "stale": {
      const where = WHERE[quote.key] ?? "";
      return {
        kind: "warning",
        text: `Puede estar desactualizado: es de hace ${ageText(state.age)}. Revisalo ${where} antes de decidir.`,
      };
    }
  }
}

export function cardEstimate(snapshot: RatesSnapshot, now: number): CardEstimate | null {
  const quote = snapshot.quotes.get(CARD_KEY);
  if (quote?.estimatedFinal == null) {
    return null;
  }
  const state = freshness(CARD_KEY, quote.observedAt, now);
  const age = state.kind === "stale" ? ageText(state.age) : null;
  const value = `${formatExact(quote.estimatedFinal)} ${PRICE_CHECKS[CARD_KEY]?.unit ?? ""}`;
  return {
    key: CARD_KEY,
    price: quote.estimatedFinal,
    fieldNote: `Mientras no lo cargues, la comparación usa el estimado: ${value}${age === null ? "" : `, de hace ${age}`}.`,
    resultNote: `Calculado con el precio estimado de la tarjeta (${value}${age === null ? "" : `, de hace ${age}: puede estar desactualizado`}). Cargá el de tu pantalla de pago de Binance para el valor exacto.`,
  };
}
