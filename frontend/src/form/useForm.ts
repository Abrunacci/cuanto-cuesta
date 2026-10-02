import { useEffect, useMemo, useState } from "react";

import type { Texts } from "../i18n/index.ts";

import { prefillTexts } from "../quotes/notices.ts";
import { estimatedPrices, type RatesSnapshot } from "../quotes/quotes.ts";
import {
  initialTexts,
  readForm,
  recordIn,
  withFeeReset,
  withNumbersIn,
  withPrefill,
  type FormReading,
  type FormTexts,
} from "./form.ts";
import { loadTexts, saveTexts } from "./storage.ts";

export interface Form {
  readonly texts: FormTexts;
  readonly reading: FormReading;
  /**
   * The text each price was prefilled with, by rate key. A field still holding it shows what
   * the screen says about that price; once the person changes it, the value is theirs.
   */
  readonly prefilled: Readonly<Record<string, string>>;
  readonly setAmount: (text: string) => void;
  readonly setPrice: (key: string, text: string) => void;
  /** Typing into a fee, value or minimum, makes it the person's own. */
  readonly setFee: (id: string, text: string) => void;
  readonly setMinimum: (id: string, text: string) => void;
  /** Every fee back to its researched value, and none the person's own. */
  readonly resetFees: () => void;
  /** One fee back to its researched value, minimum included, and no longer the person's own. */
  readonly resetFee: (id: string) => void;
}

/**
 * The form's texts and what they mean, in the page's language `t`; everything is recomputed on
 * every change. The form starts as the person left it, and remembers every change. The latest
 * prices, once they arrive, fill the price fields still empty. When the language changes, every
 * number typed is rewritten in the new one's style, so it keeps meaning the same.
 */
export function useForm(rates: RatesSnapshot | null, t: Texts): Form {
  const [texts, setTexts] = useState<FormTexts>(() => loadTexts(t));
  const [prefilled, setPrefilled] = useState<Readonly<Record<string, string>>>({});
  // Convert while rendering, like the prices below, so a field never shows the old style.
  const [seenTexts, setSeenTexts] = useState(t);
  if (t !== seenTexts) {
    setSeenTexts(t);
    setTexts((current) => withNumbersIn(current, seenTexts.numbers, t.numbers));
    setPrefilled((current) => recordIn(current, seenTexts.numbers, t.numbers));
  }
  const estimates = useMemo(() => estimatedPrices(rates), [rates]);
  const reading = useMemo(() => readForm(t, texts, estimates), [t, texts, estimates]);
  const { language } = t;
  useEffect(() => {
    saveTexts(texts, language);
  }, [texts, language]);
  // Prefill while rendering the prices that just arrived, so they never show empty for a frame.
  const [seenRates, setSeenRates] = useState(rates);
  if (rates !== seenRates) {
    setSeenRates(rates);
    if (rates !== null) {
      const values = prefillTexts(t.numbers, rates);
      setTexts((current) => withPrefill(current, values));
      setPrefilled(values);
    }
  }
  const own = (current: FormTexts, id: string) =>
    current.ownFees.has(id) ? current.ownFees : new Set([...current.ownFees, id]);
  return {
    texts,
    reading,
    prefilled,
    setAmount: (text) => {
      setTexts((current) => ({ ...current, amount: text }));
    },
    setPrice: (key, text) => {
      setTexts((current) => ({ ...current, prices: { ...current.prices, [key]: text } }));
    },
    setFee: (id, text) => {
      setTexts((current) => ({
        ...current,
        fees: { ...current.fees, [id]: text },
        ownFees: own(current, id),
      }));
    },
    setMinimum: (id, text) => {
      setTexts((current) => ({
        ...current,
        minimums: { ...current.minimums, [id]: text },
        ownFees: own(current, id),
      }));
    },
    resetFee: (id) => {
      setTexts((current) => withFeeReset(t.numbers, current, id));
    },
    resetFees: () => {
      const start = initialTexts(t.numbers);
      setTexts((current) => ({
        ...current,
        fees: start.fees,
        minimums: start.minimums,
        ownFees: start.ownFees,
      }));
    },
  };
}
