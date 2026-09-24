import type { ReactNode } from "react";

/** A link that opens in a new tab, and says so to screen readers. */
export function ExternalLink({
  href,
  label,
  children,
}: {
  readonly href: string;
  /** Accessible name when the visible text alone is ambiguous, e.g. several "Fuente" links. */
  readonly label?: string;
  readonly children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {children}
      {label === undefined && (
        <>
          {" "}
          <span className="visually-hidden">(se abre en otra pestaña)</span>
        </>
      )}
    </a>
  );
}
