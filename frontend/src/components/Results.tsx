import type { Comparison } from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { formatMoney } from "../text/numbers.ts";
import { RouteFigures } from "./RouteFigures.tsx";

interface ResultsProps {
  readonly comparison: Comparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
}

/**
 * The ranking, best route first. Only the one-line summary is announced to screen readers, so
 * typing in a field does not read out every figure on each keystroke.
 */
export function Results({ comparison, feeGaps }: ResultsProps) {
  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title">Resultado</h2>
      <p className="summary" aria-live="polite" aria-atomic="true">
        {summary(comparison)}
      </p>
      <ol className="ranking">
        {comparison.routes.map((entry) => (
          <li key={entry.route.id}>
            <h3>{entry.route.name}</h3>
            <RouteFigures entry={entry} feeGaps={feeGaps} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function summary({ atReference, routes }: Comparison): string {
  if (atReference === null) {
    return "Completá el monto y el dólar MEP para comparar las rutas.";
  }
  const best = routes[0];
  const reference = `Al dólar MEP serían ${formatMoney(atReference.amount, atReference.currency)}.`;
  if (best?.status !== "complete") {
    return `${reference} Completá las cotizaciones de cada ruta para compararlas.`;
  }
  const { final } = best.result;
  return `${reference} Mejor ruta: ${best.route.name}, llegan ${formatMoney(final.amount, final.currency)}.`;
}
