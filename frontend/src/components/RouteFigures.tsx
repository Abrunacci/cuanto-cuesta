import type { MissingInput, RouteComparison } from "../calculator/index.ts";
import { fieldId, type FeeGap } from "../form/form.ts";
import { missingInputLabel } from "../form/messages.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney } from "../text/numbers.ts";
import { InPageAnchor } from "./LinkList.tsx";

interface RouteFiguresProps {
  readonly entry: RouteComparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  /** Labels of the unusual prices this route was computed with, e.g. ["precio P2P…"]. */
  readonly unusualPrices: readonly string[];
  /** Take the person to a field, opening the route's card when the field is inside it. */
  readonly onGoToField: (routeId: string, id: string) => void;
}

/** A route's three figures, or what it still needs, each item a link to its field. */
export function RouteFigures({ entry, feeGaps, unusualPrices, onGoToField }: RouteFiguresProps) {
  if (entry.status === "incomplete") {
    return (
      <div className="missing">
        <p>Falta completar o corregir:</p>
        <ul>
          {entry.missing.map((missing) => {
            const id = missingFieldId(missing, feeGaps);
            return (
              <li key={id}>
                <InPageAnchor
                  link={{
                    key: id,
                    href: `#${id}`,
                    text: missingInputLabel(missing, feeGaps),
                    onClick: () => {
                      onGoToField(entry.route.id, id);
                    },
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>
    );
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
      {unusualPrices.length > 0 && (
        <p className="unusual">Calculado con un valor inusual: {joinSpanish(unusualPrices)}.</p>
      )}
      {entry.result.exhausted && (
        <p className="exhausted">Las comisiones se comen todo el monto en algún paso.</p>
      )}
    </>
  );
}

/** The field to fill for a missing input: for a fee, its value or its minimum. */
function missingFieldId(missing: MissingInput, feeGaps: ReadonlyMap<string, FeeGap>): string {
  switch (missing.kind) {
    case "amount":
      return fieldId.amount;
    case "rate":
      return fieldId.price(missing.key);
    case "fee":
      return feeGaps.get(missing.id) === "minimum"
        ? fieldId.minimum(missing.id)
        : fieldId.fee(missing.id);
  }
}
