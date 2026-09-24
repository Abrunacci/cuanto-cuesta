import { RATE_FIELDS } from "../calculator/index.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { NumberField } from "./NumberField.tsx";

interface InputsProps {
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly onAmount: (text: string) => void;
  readonly onPrice: (key: string, text: string) => void;
}

/** Everything the person has to type: the amount and one price per route. */
export function Inputs({ texts, reading, onAmount, onPrice }: InputsProps) {
  return (
    <section className="card" aria-labelledby="inputs-title">
      <h2 id="inputs-title">Tus datos</h2>
      <p className="muted small">
        Podés usar punto para los miles y coma para los decimales: 1.536,16.
      </p>
      <p className="muted small">
        El monto queda guardado en este navegador; las cotizaciones no, cargá las del día.
      </p>
      <NumberField
        id={fieldId.amount}
        label="Monto en Payoneer"
        unit="USD"
        value={texts.amount}
        onChange={onAmount}
        problem={reading.problems.get(fieldId.amount) ?? null}
        echo={reading.echoes.get(fieldId.amount)}
        help="Los dólares de tu cuenta de Payoneer que querés pasar a pesos."
        placeholder="Ej.: 1.000"
      />
      {RATE_FIELDS.map((field) => {
        const id = fieldId.price(field.key);
        return (
          <NumberField
            key={field.key}
            id={id}
            label={field.label}
            unit={field.quote}
            value={texts.prices[field.key] ?? ""}
            onChange={(text) => {
              onPrice(field.key, text);
            }}
            problem={reading.problems.get(id) ?? null}
            warning={reading.warnings.get(id)}
            echo={reading.echoes.get(id)}
            help={field.help}
          />
        );
      })}
    </section>
  );
}
