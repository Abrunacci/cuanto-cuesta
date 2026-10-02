import { RATE_FIELDS } from "../calculator/index.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { fieldNotice, type CardEstimate, type FieldNotice } from "../quotes/notices.ts";
import type { Rates } from "../quotes/useRates.ts";
import { rateTexts, useTexts } from "../i18n/index.ts";
import { NumberField } from "./NumberField.tsx";

interface InputsProps {
  readonly texts: FormTexts;
  readonly reading: FormReading;
  /** The latest prices, or null while they have not arrived or when they cannot. */
  readonly rates: Rates | null;
  /** The text each price was prefilled with, by rate key. */
  readonly prefilled: Readonly<Record<string, string>>;
  /** The card's estimate, used while its field is empty. */
  readonly estimate: CardEstimate | null;
  readonly onAmount: (text: string) => void;
  readonly onPrice: (key: string, text: string) => void;
}

/** Everything the person has to type: the amount and one price per route. */
export function Inputs({
  texts,
  reading,
  rates,
  prefilled,
  estimate,
  onAmount,
  onPrice,
}: InputsProps) {
  const t = useTexts();
  const notice = (key: string): FieldNotice | null => {
    const text = texts.prices[key] ?? "";
    if (estimate?.key === key) {
      return reading.estimated.has(key) ? { kind: "note", text: estimate.fieldNote } : null;
    }
    // Only while the field holds the prefilled price: once the person changes it, it is theirs.
    const quote = rates?.snapshot.quotes.get(key);
    if (rates === null || quote === undefined || prefilled[key] !== text) {
      return null;
    }
    return fieldNotice(t, quote, rates.now);
  };
  const anyPrefilled = Object.keys(prefilled).length > 0;
  return (
    <section className="card" aria-labelledby="inputs-title">
      <h2 id="inputs-title">{t.inputs.title}</h2>
      <p className="muted small">{t.inputs.intro(anyPrefilled)}</p>
      <NumberField
        id={fieldId.amount}
        label={t.inputs.amountLabel}
        unit="USD"
        value={texts.amount}
        onChange={onAmount}
        problem={reading.problems.get(fieldId.amount) ?? null}
        echo={reading.echoes.get(fieldId.amount)}
        help={t.inputs.amountHelp}
        helpWhileNeeded
        placeholder={t.inputs.amountPlaceholder}
      />
      {RATE_FIELDS.map((field) => {
        const id = fieldId.price(field.key);
        const words = rateTexts(t, field.key);
        return (
          <NumberField
            key={field.key}
            id={id}
            label={words.label}
            unit={field.quote}
            value={texts.prices[field.key] ?? ""}
            onChange={(text) => {
              onPrice(field.key, text);
            }}
            problem={reading.problems.get(id) ?? null}
            warning={reading.warnings.get(id)}
            echo={reading.echoes.get(id)}
            notice={notice(field.key)}
            help={words.help}
            helpWhileNeeded
          />
        );
      })}
    </section>
  );
}
