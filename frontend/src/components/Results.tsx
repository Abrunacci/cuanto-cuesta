import { useEffect } from "react";

import {
  routesInOrder,
  type Comparison,
  type Ranking,
  type RouteComparison,
} from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { missingInputLabel } from "../form/messages.ts";
import { commonMissing, missingFieldId, missingKey } from "../form/missing.ts";
import { difference, unusualPrices } from "../form/review.ts";
import { summaryText } from "../form/summary.ts";
import { RESULTS_TITLE_ID, routeResultId } from "./ids.ts";
import { LinkList } from "./LinkList.tsx";
import { RichText } from "./RichText.tsx";
import { RouteFigures, RouteMissing } from "./RouteFigures.tsx";
import { RouteReview } from "./RouteReview.tsx";

interface ResultsProps {
  readonly comparison: Comparison;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  /** The amount holds a value that cannot be used. */
  readonly amountHasProblem: boolean;
  /** Field ids whose value is used but looks wrong. */
  readonly warnings: ReadonlyMap<string, string>;
  /** Ids of the fees the person set. */
  readonly ownFees: ReadonlySet<string>;
  /** Ids of the routes whose review list is open. */
  readonly openReviews: ReadonlySet<string>;
  readonly onReviewToggle: (routeId: string, open: boolean) => void;
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * The routes by what they deliver, most first (a risky route can come before the best one, which
 * is never risky), each with its warnings so they are seen even while the route's
 * card is closed. What every route is missing is listed once, above them. Only the one-line
 * summary is announced to screen readers, so typing does not read out every figure.
 */
export function Results({
  comparison,
  feeGaps,
  amountHasProblem,
  warnings,
  ownFees,
  openReviews,
  onReviewToggle,
  onGoToField,
}: ResultsProps) {
  const common = commonMissing(comparison);
  const listedOnce = new Set(common.map(missingKey));
  // Common inputs are the amount and the prices at the top: no fee is used by every route (a
  // data test enforces it), so no route card needs opening from here.
  useLogFailures(comparison.failed);
  const routes = routesInOrder(comparison);
  const [firstRoute] = routes;
  return (
    <section className="results" aria-labelledby={RESULTS_TITLE_ID}>
      <h2 id={RESULTS_TITLE_ID} className="jump-target" tabIndex={-1}>
        Resultado
      </h2>
      <p className="summary" aria-live="polite" aria-atomic="true">
        {summaryText(comparison, amountHasProblem)}
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
        {routes.map((entry) => (
          <li key={entry.route.id}>
            {/* The label stays out of the heading, whose name is the route's. */}
            <div className="route-heading">
              <h3 id={routeResultId(entry.route.id)} className="jump-target" tabIndex={-1}>
                {entry.route.name}
              </h3>
              {entry.route.risk !== null && (
                <span className="risk-badge">{entry.route.risk.label}</span>
              )}
            </div>
            <RouteBody
              entry={entry}
              ranking={comparison.ranking}
              feeGaps={feeGaps}
              skip={listedOnce}
              warnings={warnings}
              ownFees={ownFees}
              reviewOpen={openReviews.has(entry.route.id)}
              onReviewToggle={(open) => {
                onReviewToggle(entry.route.id, open);
              }}
              onGoToField={onGoToField}
            />
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

/** Under a route's name: its figures, what it still needs, or that its data is wrong. */
function RouteBody({
  entry,
  ranking,
  feeGaps,
  skip,
  warnings,
  ownFees,
  reviewOpen,
  onReviewToggle,
  onGoToField,
}: {
  readonly entry: RouteComparison;
  readonly ranking: Ranking;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  readonly skip: ReadonlySet<string>;
  readonly warnings: ReadonlyMap<string, string>;
  readonly ownFees: ReadonlySet<string>;
  readonly reviewOpen: boolean;
  readonly onReviewToggle: (open: boolean) => void;
  readonly onGoToField: ResultsProps["onGoToField"];
}) {
  switch (entry.status) {
    case "complete":
      return (
        <>
          <RouteFigures
            result={entry.result}
            feeCost={entry.feeCost}
            difference={difference(entry, ranking, ownFees, warnings)}
            unusualPrices={unusualPrices(entry.route, warnings)}
            ownFees={ownFees}
            onGoToField={onGoToField}
          />
          <RouteReview
            route={entry.route}
            ownFees={ownFees}
            open={reviewOpen}
            onToggle={onReviewToggle}
            onGoToField={onGoToField}
          />
        </>
      );
    case "incomplete":
      return <RouteMissing entry={entry} feeGaps={feeGaps} skip={skip} onGoToField={onGoToField} />;
    case "failed":
      return (
        <p className="missing">
          No se puede calcular esta ruta: hay un problema con las cotizaciones o comisiones que usa.
          No es un error en lo que cargaste.
        </p>
      );
  }
}

/** Log what is wrong with the failed routes' data, once each time it changes, for whoever fixes it. */
function useLogFailures(failed: Comparison["failed"]): void {
  const report = failed.map(({ route, error }) => `${route.id}: ${error.message}`).join("\n");
  useEffect(() => {
    if (report !== "") {
      console.error(`Routes that cannot be computed because of their data:\n${report}`);
    }
  }, [report]);
}
