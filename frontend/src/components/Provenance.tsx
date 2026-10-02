import type { Provenance as FeeProvenance } from "../calculator/index.ts";
import { feeStatusText } from "../form/messages.ts";
import { useTexts } from "../i18n/index.ts";
import { ExternalLink } from "./ExternalLink.tsx";

const BADGE_CLASS: Record<FeeProvenance["kind"], string> = {
  verified: "badge badge-verified",
  estimate: "badge badge-estimate",
  user_defined: "badge badge-user",
};

interface StatusBadgeProps {
  readonly provenance: FeeProvenance;
  /** The person set this fee: that replaces the reference's status. */
  readonly own: boolean;
}

/** Whose value a fee holds, and for a reference value how far to trust it, as a short badge. */
export function StatusBadge({ provenance, own }: StatusBadgeProps) {
  const t = useTexts();
  return (
    <span className={own ? "badge badge-own" : BADGE_CLASS[provenance.kind]}>
      {feeStatusText(t, provenance, own)}
    </span>
  );
}

interface ProvenanceProps {
  readonly provenance: FeeProvenance;
  /** The fee's label, so each source link has a distinct accessible name. */
  readonly feeLabel: string;
}

/** When the reference value was checked and where it comes from. */
export function Provenance({ provenance, feeLabel }: ProvenanceProps) {
  const { provenance: words } = useTexts();
  switch (provenance.kind) {
    case "verified":
      return (
        <p className="provenance">
          {words.verified(words.date(provenance.verifiedAt))} ·{" "}
          <ExternalLink href={provenance.sourceUrl} label={words.sourceOf(feeLabel)}>
            {words.source}
          </ExternalLink>
        </p>
      );
    case "estimate":
      return (
        <p className="provenance">
          {provenance.upperBound ? words.upperBound : ""}
          {words.reviewed(words.date(provenance.verifiedAt))} ·{" "}
          <ExternalLink href={provenance.sourceUrl} label={words.sourceOf(feeLabel)}>
            {words.source}
          </ExternalLink>
        </p>
      );
    case "user_defined":
      return (
        <p className="provenance">
          {words.reviewed(words.date(provenance.checkedAt))} ·{" "}
          <ExternalLink href={provenance.referenceUrl} label={words.referenceOf(feeLabel)}>
            {words.reference}
          </ExternalLink>
        </p>
      );
  }
}
