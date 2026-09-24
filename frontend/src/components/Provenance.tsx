import type { Provenance as FeeProvenance } from "../calculator/index.ts";

/** Where a fee's reference value comes from: verified, estimated, or set by the person. */
export function Provenance({ provenance }: { readonly provenance: FeeProvenance }) {
  switch (provenance.kind) {
    case "verified":
      return (
        <p className="provenance">
          <span className="badge badge-verified">Verificado</span> el{" "}
          {formatDate(provenance.verifiedAt)} ·{" "}
          <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">
            Fuente
          </a>
        </p>
      );
    case "estimate":
      return (
        <p className="provenance">
          <span className="badge badge-estimate">Estimado</span>
          {provenance.upperBound ? " (la fuente da un tope: es el valor máximo)" : ""} · revisado el{" "}
          {formatDate(provenance.verifiedAt)} ·{" "}
          <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">
            Fuente
          </a>
        </p>
      );
    case "user_defined":
      return (
        <p className="provenance">
          <span className="badge badge-user">Lo definís vos</span> ·{" "}
          <a href={provenance.referenceUrl} target="_blank" rel="noreferrer">
            Precio de referencia
          </a>
        </p>
      );
  }
}

/** "2026-09-23" as "23/09/2026". */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}
