import { useEffect, useMemo, useState } from "react";

import { prefillTexts } from "../quotes/notices.ts";
import { estimatedPrices, type RatesSnapshot } from "../quotes/quotes.ts";
import {
  initialTexts,
  readForm,
  withFeeReset,
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
 * The form's texts and what they mean; everything is recomputed on every change. The form starts
 * as the person left it, and remembers every change. The latest prices, once they arrive, fill
 * the price fields still empty.
 */
export function useForm(rates: RatesSnapshot | null): Form {
  const [texts, setTexts] = useState<FormTexts>(loadTexts);
  const [prefilled, setPrefilled] = useState<Readonly<Record<string, string>>>({});
  const estimates = useMemo(() => estimatedPrices(rates), [rates]);
  const reading = useMemo(() => readForm(texts, estimates), [texts, estimates]);
  useEffect(() => {
    saveTexts(texts);
  }, [texts]);
  // Prefill while rendering the prices that just arrived, so they never show empty for a frame.
  const [seenRates, setSeenRates] = useState(rates);
  if (rates !== seenRates) {
    setSeenRates(rates);
    if (rates !== null) {
      const values = prefillTexts(rates);
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
      setTexts((current) => withFeeReset(current, id));
    },
    resetFees: () => {
      const start = initialTexts();
      setTexts((current) => ({
        ...current,
        fees: start.fees,
        minimums: start.minimums,
        ownFees: start.ownFees,
      }));
    },
  };
}
