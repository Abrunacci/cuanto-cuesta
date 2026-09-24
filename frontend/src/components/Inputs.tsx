import { RATE_FIELDS } from "../calculator/index.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { NumberField } from "./NumberField.tsx";

/** Where to find each number, in a line. */
const PRICE_HELP: Readonly<Record<string, string>> = {
  mep: "Lo que te pagan por cada dólar vendido por MEP. Lo ves en tu banco o broker.",
  p2p_usdt_usd: "En Binance P2P, cuántos USD cuesta cada USDT en los avisos para comprar.",
  bitso_usdt_ars: "En Bitso, cuántos pesos te dan por cada USDT que vendés.",
  arq_usd_ars: "En la app de ARQ, cuántos pesos te dan por cada dólar digital (USDc).",
};

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
            help={PRICE_HELP[field.key]}
          />
        );
      })}
    </section>
  );
}
