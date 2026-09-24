import { useMemo, useState } from "react";

import { initialTexts, readForm, type FormReading, type FormTexts } from "./form.ts";

export interface Form {
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly setAmount: (text: string) => void;
  readonly setPrice: (key: string, text: string) => void;
  readonly setFee: (id: string, text: string) => void;
  readonly setMinimum: (id: string, text: string) => void;
}

/** The form's texts and what they mean; everything is recomputed on every change. */
export function useForm(): Form {
  const [texts, setTexts] = useState<FormTexts>(initialTexts);
  const reading = useMemo(() => readForm(texts), [texts]);
  return {
    texts,
    reading,
    setAmount: (text) => {
      setTexts((current) => ({ ...current, amount: text }));
    },
    setPrice: (key, text) => {
      setTexts((current) => ({ ...current, prices: { ...current.prices, [key]: text } }));
    },
    setFee: (id, text) => {
      setTexts((current) => ({ ...current, fees: { ...current.fees, [id]: text } }));
    },
    setMinimum: (id, text) => {
      setTexts((current) => ({ ...current, minimums: { ...current.minimums, [id]: text } }));
    },
  };
}
