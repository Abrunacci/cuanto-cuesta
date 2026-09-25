import type { RouteComparison, Standing } from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { missingFieldId, missingKey } from "../form/missing.ts";
import { missingInputLabel } from "../form/messages.ts";
import { joinSpanish } from "../text/lists.ts";
import { formatMoney } from "../text/numbers.ts";
import { InPageAnchor } from "./LinkList.tsx";

interface RouteFiguresProps {
  readonly entry: RouteComparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  /** Labels of the unusual prices this route was computed with, e.g. ["precio P2P…"]. */
  readonly unusualPrices: readonly string[];
  /** Missing inputs already listed once for every route, left out here. */
  readonly skip: ReadonlySet<string>;
  /** Take the person to a field, opening the route's card when the field is inside it. */
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * A route's three figures (what reaches the bank, the fees, and the difference with the best route
 * or, for the best, with the runner-up), or what it still needs, each item a link to its field.
 */
export function RouteFigures({
  entry,
  feeGaps,
  unusualPrices,
  skip,
  onGoToField,
}: RouteFiguresProps) {
  if (entry.status === "incomplete") {
    const missing = entry.missing.filter((m) => !skip.has(missingKey(m)));
    if (missing.length === 0) {
      return <p className="missing">Se calcula cuando completes lo de arriba.</p>;
    }
    return (
      <div className="missing">
        <p>Falta completar o corregir:</p>
        <ul>
          {missing.map((missing) => {
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
  const { standing } = entry;
  const top = standing.kind === "ahead" || standing.kind === "tied";
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
        <div className={top ? "figure figure-gain" : "figure"}>
          <dt>Diferencia</dt>
          <dd>
            <DifferenceText standing={standing} />
          </dd>
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

/** How much more or less this route leaves than the one it is compared with. */
function DifferenceText({ standing }: { readonly standing: Standing }) {
  switch (standing.kind) {
    case "ahead":
    case "behind":
      return (
        <>
          {formatMoney(standing.by.amount, standing.by.currency)}{" "}
          <span className="figure-detail">
            {standing.kind === "ahead" ? "más" : "menos"} que {standing.other.name}
          </span>
        </>
      );
    case "tied":
      return <span className="figure-detail">Igual que {standing.other.name}</span>;
    case "alone":
      return <span className="figure-detail">Todavía no hay otra ruta para comparar</span>;
  }
}
