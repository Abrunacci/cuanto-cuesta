import type { Comparison } from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney } from "../text/numbers.ts";
import { RichText } from "./RichText.tsx";
import { RouteFigures } from "./RouteFigures.tsx";

interface ResultsProps {
  readonly comparison: Comparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  /** Labels of the reference fields holding a value that cannot be used, e.g. ["el dólar MEP"]. */
  readonly referenceProblems: readonly string[];
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * The ranking, best route first, each with its warnings so they are seen even while the route's
 * card is closed. Only the one-line summary is announced to screen readers, so typing in a field
 * does not read out every figure on each keystroke.
 */
export function Results({ comparison, feeGaps, referenceProblems, onGoToField }: ResultsProps) {
  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title">Resultado</h2>
      <p className="summary" aria-live="polite" aria-atomic="true">
        {summary(comparison, referenceProblems)}
      </p>
      <ol className="ranking">
        {comparison.routes.map((entry) => (
          <li key={entry.route.id}>
            <h3>{entry.route.name}</h3>
            <RouteFigures entry={entry} feeGaps={feeGaps} onGoToField={onGoToField} />
            {entry.route.warnings.map((warning) => (
              <p key={warning} className="warning">
                <strong>Atención:</strong> <RichText text={warning} />
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

function summary(
  { atReference, routes }: Comparison,
  referenceProblems: readonly string[],
): string {
  if (atReference === null) {
    if (referenceProblems.length === 0) {
      return "Completá el monto y el dólar MEP para comparar las rutas.";
    }
    const verb =
      referenceProblems.length > 1
        ? "tienen valores que no se pueden usar"
        : "tiene un valor que no se puede usar";
    return `Revisá ${joinSpanish(referenceProblems)}: ${verb}.`;
  }
  const best = routes[0];
  const reference = `Al dólar MEP serían ${formatMoney(atReference.amount, atReference.currency)}.`;
  if (best?.status !== "complete") {
    return `${reference} Completá las cotizaciones de cada ruta para compararlas.`;
  }
  const { final } = best.result;
  return `${reference} Mejor ruta: ${best.route.name}, llegan ${formatMoney(final.amount, final.currency)}.`;
}
