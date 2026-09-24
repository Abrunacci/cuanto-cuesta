import { RATE_FIELDS, REFERENCE_KEY, ROUTES } from "./calculator/index.ts";
import { NumberField } from "./components/NumberField.tsx";
import { Results } from "./components/Results.tsx";
import { RouteCard } from "./components/RouteCard.tsx";
import { fieldId } from "./form/form.ts";
import { useForm } from "./form/useForm.ts";

const referenceLabel = RATE_FIELDS.find((f) => f.key === REFERENCE_KEY)?.label ?? REFERENCE_KEY;

export function App() {
  const form = useForm();
  const { texts, reading } = form;
  const byRoute = new Map(reading.comparison.routes.map((entry) => [entry.route.id, entry]));

  return (
    <main className="page">
      <header>
        <h1>¿Cuánto cuesta?</h1>
        <p className="lead">
          Compará cuántos pesos te llegan al banco al bajar tus dólares de Payoneer.
        </p>
      </header>

      <section className="card" aria-labelledby="inputs-title">
        <h2 id="inputs-title">Tus datos</h2>
        <NumberField
          id={fieldId.amount}
          label="Monto en Payoneer"
          unit="USD"
          value={texts.amount}
          onChange={form.setAmount}
          problem={reading.problems.get(fieldId.amount) ?? null}
          echo={reading.echoes.get(fieldId.amount)}
          placeholder="Ej.: 1.000"
        />
        <NumberField
          id={fieldId.price(REFERENCE_KEY)}
          label={referenceLabel}
          unit="ARS"
          value={texts.prices[REFERENCE_KEY] ?? ""}
          onChange={(text) => {
            form.setPrice(REFERENCE_KEY, text);
          }}
          problem={reading.problems.get(fieldId.price(REFERENCE_KEY)) ?? null}
          echo={reading.echoes.get(fieldId.price(REFERENCE_KEY))}
          help="Lo que te pagan por cada dólar hoy. Es la referencia para comparar y la cotización de la ruta MEP."
        />
        <p className="muted small">
          Podés usar punto para los miles y coma para los decimales: 1.536,16.
        </p>
      </section>

      <Results
        comparison={reading.comparison}
        feeGaps={reading.feeGaps}
        referenceProblems={[
          ...(reading.problems.has(fieldId.amount) ? ["el monto"] : []),
          ...(reading.problems.has(fieldId.price(REFERENCE_KEY)) ? ["el dólar MEP"] : []),
        ]}
      />

      {ROUTES.map((route) => {
        const entry = byRoute.get(route.id);
        return entry === undefined ? null : (
          <RouteCard
            key={route.id}
            route={route}
            entry={entry}
            texts={texts}
            reading={reading}
            onPrice={form.setPrice}
            onFee={form.setFee}
            onMinimum={form.setMinimum}
          />
        );
      })}
    </main>
  );
}
