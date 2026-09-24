import type { Comparison } from "../calculator/index.ts";
import { formatMoney } from "../text/numbers.ts";
import { RouteFigures } from "./RouteFigures.tsx";

/** The ranking: best route first. Announced to screen readers when it changes. */
export function Results({ comparison }: { readonly comparison: Comparison }) {
  const { atReference } = comparison;
  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title">Resultado</h2>
      <div aria-live="polite">
        {atReference === null ? (
          <p className="muted">Completá el monto y el dólar MEP para comparar las rutas.</p>
        ) : (
          <p className="muted">
            Al dólar MEP serían {formatMoney(atReference.amount, atReference.currency)}.
          </p>
        )}
        <ol className="ranking">
          {comparison.routes.map((entry) => (
            <li key={entry.route.id}>
              <h3>{entry.route.name}</h3>
              <RouteFigures entry={entry} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
