import type { Provenance as FeeProvenance } from "../calculator/index.ts";
import { ExternalLink } from "./ExternalLink.tsx";

interface ProvenanceProps {
  readonly provenance: FeeProvenance;
  /** The fee's label, so each source link has a distinct accessible name. */
  readonly feeLabel: string;
}

/** Where a fee's reference value comes from: verified, estimated, or set by the person. */
export function Provenance({ provenance, feeLabel }: ProvenanceProps) {
  switch (provenance.kind) {
    case "verified":
      return (
        <p className="provenance">
          <span className="badge badge-verified">Verificado</span> el{" "}
          {formatDate(provenance.verifiedAt)} ·{" "}
          <ExternalLink href={provenance.sourceUrl} label={sourceLabel(feeLabel)}>
            Fuente
          </ExternalLink>
        </p>
      );
    case "estimate":
      return (
        <p className="provenance">
          <span className="badge badge-estimate">Estimado</span>
          {provenance.upperBound ? " (la fuente da un tope: es el valor máximo)" : ""} · revisado el{" "}
          {formatDate(provenance.verifiedAt)} ·{" "}
          <ExternalLink href={provenance.sourceUrl} label={sourceLabel(feeLabel)}>
            Fuente
          </ExternalLink>
        </p>
      );
    case "user_defined":
      return (
        <p className="provenance">
          <span className="badge badge-user">Lo definís vos</span> · revisado el{" "}
          {formatDate(provenance.checkedAt)} ·{" "}
          <ExternalLink
            href={provenance.referenceUrl}
            label={`Precio de referencia de ${feeLabel} (se abre en otra pestaña)`}
          >
            Precio de referencia
          </ExternalLink>
        </p>
      );
  }
}

function sourceLabel(feeLabel: string): string {
  return `Fuente de ${feeLabel} (se abre en otra pestaña)`;
}

/** "2026-09-23" as "23/09/2026". */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}
