import type { RouteComparison } from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { missingInputLabel } from "../form/messages.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney } from "../text/numbers.ts";

interface RouteFiguresProps {
  readonly entry: RouteComparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
}

/** A route's three figures, or what it still needs. */
export function RouteFigures({ entry, feeGaps }: RouteFiguresProps) {
  if (entry.status === "incomplete") {
    const labels = entry.missing.map((missing) => missingInputLabel(missing, feeGaps));
    return <p className="missing">Falta completar o corregir: {joinSpanish(labels)}.</p>;
  }
  const { final } = entry.result;
  const loss = entry.lossVsReference;
  const gain = loss.amount.lt(0);
  return (
    <>
      <dl className="figures">
        <div className="figure figure-main">
          <dt>Llegan al banco</dt>
          <dd>{formatMoney(final.amount, final.currency)}</dd>
        </div>
        <div className="figure">
          <dt>Comisiones</dt>
          <dd>{formatMoney(entry.feeCost.amount, entry.feeCost.currency)}</dd>
        </div>
        <div className={gain ? "figure figure-gain" : "figure"}>
          <dt>{gain ? "Ganancia vs. dólar MEP" : "Pérdida vs. dólar MEP"}</dt>
          <dd>{formatMoney(loss.amount.abs(), loss.currency)}</dd>
        </div>
      </dl>
      {entry.result.exhausted && (
        <p className="exhausted">Las comisiones se comen todo el monto en algún paso.</p>
      )}
    </>
  );
}
