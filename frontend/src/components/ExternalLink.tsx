import type { ReactNode } from "react";

import { useTexts } from "../i18n/index.ts";

/**
 * A link that opens in a new tab. Its accessible name says so; it is set with `aria-label`
 * rather than hidden text, which would leave a visible, underlined space inside the link.
 */
export function ExternalLink({
  href,
  label,
  children,
}: {
  readonly href: string;
  /** What the link is, without the new-tab notice, e.g. "Fuente de Retiro de ARS de ARQ a CBU". */
  readonly label: string;
  readonly children: ReactNode;
}) {
  const t = useTexts();
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={t.page.newTab(label)}>
      {children}
    </a>
  );
}
