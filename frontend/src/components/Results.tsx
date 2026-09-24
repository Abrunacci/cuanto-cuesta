import type { Comparison } from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { missingInputLabel } from "../form/messages.ts";
import { commonMissing, missingFieldId, missingKey } from "../form/missing.ts";
import { unusualPrices } from "../form/review.ts";
import { summaryText, type ReferenceProblems } from "../form/summary.ts";
import { RESULTS_TITLE_ID, routeResultId } from "./ids.ts";
import { LinkList } from "./LinkList.tsx";
import { RichText } from "./RichText.tsx";
import { RouteFigures } from "./RouteFigures.tsx";
import { RouteReview } from "./RouteReview.tsx";

interface ResultsProps {
  readonly comparison: Comparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  readonly referenceProblems: ReferenceProblems;
  /** Field ids whose value is used but looks wrong. */
  readonly warnings: ReadonlyMap<string, string>;
  /** Ids of the fees the person set. */
  readonly ownFees: ReadonlySet<string>;
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * The ranking, best route first, each with its warnings so they are seen even while the route's
 * card is closed. What every route is missing is listed once, above them. Only the one-line
 * summary is announced to screen readers, so typing does not read out every figure.
 */
export function Results({
  comparison,
  feeGaps,
  referenceProblems,
  warnings,
  ownFees,
  onGoToField,
}: ResultsProps) {
  const common = commonMissing(comparison);
  const listedOnce = new Set(common.map(missingKey));
  // Common inputs are the amount and the prices at the top: every fee belongs to one route (a
  // data test enforces it), so no route card needs opening from here.
  const [firstRoute] = comparison.routes;
  return (
    <section className="results" aria-labelledby={RESULTS_TITLE_ID}>
      <h2 id={RESULTS_TITLE_ID} tabIndex={-1}>
        Resultado
      </h2>
      <p className="summary" aria-live="polite" aria-atomic="true">
        {summaryText(comparison, referenceProblems)}
      </p>
      {common.length > 0 && firstRoute !== undefined && (
        <p className="missing">
          Falta completar o corregir:{" "}
          <LinkList
            links={common.map((missing) => {
              const id = missingFieldId(missing, feeGaps);
              return {
                key: missingKey(missing),
                href: `#${id}`,
                text: missingInputLabel(missing, feeGaps),
                onClick: () => {
                  onGoToField(firstRoute.route.id, id);
                },
              };
            })}
          />
          .
        </p>
      )}
      <ol className="ranking">
        {comparison.routes.map((entry) => (
          <li key={entry.route.id}>
            <h3 id={routeResultId(entry.route.id)} tabIndex={-1}>
              {entry.route.name}
            </h3>
            <RouteFigures
              entry={entry}
              feeGaps={feeGaps}
              unusualPrices={unusualPrices(entry.route, warnings)}
              skip={listedOnce}
              onGoToField={onGoToField}
            />
            {entry.status === "complete" && (
              <RouteReview route={entry.route} ownFees={ownFees} onGoToField={onGoToField} />
            )}
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
