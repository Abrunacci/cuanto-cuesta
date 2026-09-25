import type { Provenance as FeeProvenance } from "../calculator/index.ts";
import { feeStatusText } from "../form/messages.ts";
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
  return (
    <span className={own ? "badge badge-own" : BADGE_CLASS[provenance.kind]}>
      {feeStatusText(provenance, own)}
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
  switch (provenance.kind) {
    case "verified":
      return (
        <p className="provenance">
          Verificado el {formatDate(provenance.verifiedAt)} ·{" "}
          <ExternalLink href={provenance.sourceUrl} label={`Fuente de ${feeLabel}`}>
            Fuente
          </ExternalLink>
        </p>
      );
    case "estimate":
      return (
        <p className="provenance">
          {provenance.upperBound ? "La fuente da un tope: es el valor máximo. " : ""}Revisado el{" "}
          {formatDate(provenance.verifiedAt)} ·{" "}
          <ExternalLink href={provenance.sourceUrl} label={`Fuente de ${feeLabel}`}>
            Fuente
          </ExternalLink>
        </p>
      );
    case "user_defined":
      return (
        <p className="provenance">
          Revisado el {formatDate(provenance.checkedAt)} ·{" "}
          <ExternalLink
            href={provenance.referenceUrl}
            label={`Precio de referencia de ${feeLabel}`}
          >
            Precio de referencia
          </ExternalLink>
        </p>
      );
  }
}

/** "2026-09-23" as "23/09/2026". */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}
