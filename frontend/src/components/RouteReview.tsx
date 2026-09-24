import type { Route } from "../calculator/index.ts";
import { fieldId } from "../form/form.ts";
import { feesToReview } from "../form/review.ts";
import { lowerFirst } from "../text/case.ts";
import { formatFeeValue } from "../text/numbers.ts";
import { InPageAnchor, LinkList, type InPageLink } from "./LinkList.tsx";

interface RouteReviewProps {
  readonly route: Route;
  /** Ids of the fees still at their researched value. */
  readonly unchangedFees: ReadonlySet<string>;
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * What to check before trusting a route's result, each fee a link to its field. Someone who
 * only reads the result must not decide on a number that silently assumes a 0.
 */
export function RouteReview({ route, unchangedFees, onGoToField }: RouteReviewProps) {
  const { toSet, estimated } = feesToReview(route, unchangedFees);
  if (toSet.length === 0 && estimated.length === 0) {
    return null;
  }
  const link = (id: string, text: string): InPageLink => ({
    key: id,
    href: `#${fieldId.fee(id)}`,
    text,
    onClick: () => {
      onGoToField(route.id, fieldId.fee(id));
    },
  });
  const links = estimated.map(({ fee, label }) => link(fee.id, lowerFirst(label)));
  return (
    <div className="review">
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
    </div>
  );
}
