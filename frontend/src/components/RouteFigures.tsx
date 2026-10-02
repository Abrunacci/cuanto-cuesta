import type { IncompleteRoute, Money, Route, RouteResult } from "../calculator/index.ts";
import type { FeeGap } from "../form/form.ts";
import { missingFieldId, missingKey } from "../form/missing.ts";
import { missingInputLabel } from "../form/messages.ts";
import { reviewOpensList, type Difference } from "../form/review.ts";
import { routeName, useTexts } from "../i18n/index.ts";
import { reviewTargetId } from "./ids.ts";
import { InPageAnchor } from "./LinkList.tsx";

/**
 * Take the person to a field, opening the route's card when the field is inside it; or to any
 * other element of the page, such as a route's result heading.
 */
type GoTo = (routeId: string, id: string) => void;

interface RouteFiguresProps {
  readonly result: RouteResult;
  readonly feeCost: Money;
  readonly difference: Difference;
  /** Labels of the unusual prices this route was computed with, e.g. ["precio P2P…"]. */
  readonly unusualPrices: readonly string[];
  /** Ids of the fees the person set. */
  readonly ownFees: ReadonlySet<string>;
  readonly onGoToField: GoTo;
}

/**
 * A route's three figures: what reaches the bank, the fees, and the difference with the best
 * route without risk or, for that one, with the runner-up without risk.
 */
export function RouteFigures({
  result,
  feeCost,
  difference,
  unusualPrices,
  ownFees,
  onGoToField,
}: RouteFiguresProps) {
  const t = useTexts();
  const { results, numbers } = t;
  const { final } = result;
  const top = difference.kind === "compared" && difference.recommended;
  return (
    <>
      <dl className="figures">
        <div className="figure figure-main">
          <dt>{results.arrives}</dt>
          <dd>{numbers.money(final.amount, final.currency)}</dd>
        </div>
        <div className="figure">
          <dt>{results.fees}</dt>
          <dd>{numbers.money(feeCost.amount, feeCost.currency)}</dd>
        </div>
        <div className={top ? "figure figure-gain" : "figure"}>
          <dt>{results.difference}</dt>
          <dd>
            <DifferenceText difference={difference} ownFees={ownFees} onGoToField={onGoToField} />
          </dd>
        </div>
      </dl>
      {unusualPrices.length > 0 && (
        <p className="unusual">{results.unusual(t.list(unusualPrices))}</p>
      )}
      {result.exhausted && <p className="exhausted">{results.exhausted}</p>}
    </>
  );
}

/**
 * How much more or less this route leaves than the one it is compared with, and "· revisá", a
 * link to the route whose values to check, when the difference rests on any.
 */
function DifferenceText({
  difference,
  ownFees,
  onGoToField,
}: {
  readonly difference: Difference;
  readonly ownFees: ReadonlySet<string>;
  readonly onGoToField: GoTo;
}) {
  const t = useTexts();
  const { results } = t;
  switch (difference.kind) {
    case "alone":
      return <span className="figure-detail">{results.aloneDifference}</span>;
    case "unrivaled":
      return <span className="figure-detail">{results.unrivaledDifference}</span>;
    case "compared":
      break;
  }
  const { standing, review } = difference;
  const other = routeName(t, standing.other);
  const reviewLink = review !== null && (
    <ReviewLink review={review} ownFees={ownFees} onGoToField={onGoToField} />
  );
  switch (standing.kind) {
    case "ahead":
    case "over":
    case "behind":
      return (
        <>
          {t.numbers.money(standing.by.amount, standing.by.currency)}{" "}
          <span className="figure-detail">
            {standing.kind === "behind" ? results.less(other) : results.more(other)}
            {reviewLink}
          </span>
        </>
      );
    case "tied":
      return (
        <span className="figure-detail">
          {results.same(other)}
          {reviewLink}
        </span>
      );
  }
}

/** " · revisá": a link to what to check in `review`, the route the difference rests on. */
function ReviewLink({
  review,
  ownFees,
  onGoToField,
}: {
  readonly review: Route;
  readonly ownFees: ReadonlySet<string>;
  readonly onGoToField: GoTo;
}) {
  const t = useTexts();
  const target = reviewTargetId(review.id, reviewOpensList(review, ownFees));
  return (
    <>
      {" "}
      <span className="figure-review">
        <span aria-hidden="true">· </span>
        <InPageAnchor
          link={{
            key: review.id,
            href: `#${target}`,
            text: t.results.review,
            // An aria-label, unlike the phone's bar, which builds its name from hidden text: this
            // link is one word, so the label can say whose values it is about in full, and it
            // still starts with the word seen.
            label: t.results.reviewLabel(routeName(t, review)),
            onClick: () => {
              onGoToField(review.id, target);
            },
          }}
        />
      </span>
    </>
  );
}

interface RouteMissingProps {
  readonly entry: IncompleteRoute;
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  /** Missing inputs already listed once for every route, left out here. */
  readonly skip: ReadonlySet<string>;
  readonly onGoToField: GoTo;
}

/** What a route still needs, each item a link to its field. */
export function RouteMissing({ entry, feeGaps, skip, onGoToField }: RouteMissingProps) {
  const t = useTexts();
  const missing = entry.missing.filter((m) => !skip.has(missingKey(m)));
  if (missing.length === 0) {
    return <p className="missing">{t.results.routeMissingDone}</p>;
  }
  return (
    <div className="missing">
      <p>{t.results.missingTitle}</p>
      <ul>
        {missing.map((missing) => {
          const id = missingFieldId(missing, feeGaps);
          return (
            <li key={id}>
              <InPageAnchor
                link={{
                  key: id,
                  href: `#${id}`,
                  text: missingInputLabel(t, missing, feeGaps),
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
