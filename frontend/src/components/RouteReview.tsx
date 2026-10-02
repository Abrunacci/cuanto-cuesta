import type { Route } from "../calculator/index.ts";
import { fieldId } from "../form/form.ts";
import { feesToReview, reviewSummary } from "../form/review.ts";
import { feeInSentence, feeTexts, useTexts } from "../i18n/index.ts";
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
  const t = useTexts();
  const review = feesToReview(route, ownFees);
  const summary = reviewSummary(t, review);
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
  const links = estimated.map(({ fee }) => link(fee.id, feeInSentence(t, fee.id)));
  const ownLinks = own.map(({ fee }) => link(fee.id, feeInSentence(t, fee.id)));
  const estimatedText = t.review.estimated(links.length);
  return (
    <details
      className="review"
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
    >
      <summary id={routeReviewId(route.id)} className="jump-target">
        {summary}
      </summary>
      {toSet.map(({ fee }) => (
        <p key={fee.id}>
          <InPageAnchor link={link(fee.id, feeTexts(t, fee.id).label)} />
          {t.review.toSet(t.numbers.feeValue(fee))}
        </p>
      ))}
      {links.length > 0 && (
        <p>
          {estimatedText.before}
          <LinkList links={links} />
          {estimatedText.after}
        </p>
      )}
      {ownLinks.length > 0 && (
        <p className="muted">
          {t.review.own} <LinkList links={ownLinks} />.
        </p>
      )}
    </details>
  );
}
