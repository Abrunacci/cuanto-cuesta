import type { Route } from "../calculator/index.ts";
import { fieldId } from "../form/form.ts";
import { feesToReview, reviewSummary } from "../form/review.ts";
import { lowerFirst } from "../text/case.ts";
import { formatFeeValue } from "../text/numbers.ts";
import { routeReviewId } from "./ids.ts";
import { InPageAnchor, LinkList, type InPageLink } from "./LinkList.tsx";

interface RouteReviewProps {
  readonly route: Route;
  /** Ids of the fees the person set. */
  readonly ownFees: ReadonlySet<string>;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * What to check before trusting a route's result, and which values are the person's own, each
 * fee a link to its field. Someone who only reads the result must not decide on a number that
 * silently assumes a 0: the list folds to keep every route in view on a wide screen, and its
 * line still counts what there is to check.
 */
export function RouteReview({ route, ownFees, open, onToggle, onGoToField }: RouteReviewProps) {
  const review = feesToReview(route, ownFees);
  const summary = reviewSummary(review);
  if (summary === null) {
    return null;
  }
  const { toSet, estimated, own } = review;
  const link = (id: string, text: string): InPageLink => ({
    key: id,
    href: `#${fieldId.fee(id)}`,
    text,
    onClick: () => {
      onGoToField(route.id, fieldId.fee(id));
    },
  });
  const links = estimated.map(({ fee, label }) => link(fee.id, lowerFirst(label)));
  const ownLinks = own.map(({ fee, label }) => link(fee.id, lowerFirst(label)));
  return (
    <details
      className="review"
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
    >
      <summary id={routeReviewId(route.id)}>{summary}</summary>
      {toSet.map(({ fee, label }) => (
        <p key={fee.id}>
          <InPageAnchor link={link(fee.id, label)} />: está en {formatFeeValue(fee)}, poné tu valor.
        </p>
      ))}
      {links.length === 1 && (
        <p>
          Incluye una comisión estimada: <LinkList links={links} />. Revisala si sabés la tuya.
        </p>
      )}
      {links.length > 1 && (
        <p>
          Incluye comisiones estimadas: <LinkList links={links} />. Revisalas si sabés las tuyas.
        </p>
      )}
      {ownLinks.length > 0 && (
        <p className="muted">
          Con tu valor: <LinkList links={ownLinks} />.
        </p>
      )}
    </details>
  );
}
