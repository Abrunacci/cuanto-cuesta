import { useTexts } from "../i18n/index.ts";

export interface InPageLink {
  readonly key: string;
  readonly href: string;
  readonly text: string;
  /**
   * A fuller accessible name, when the visible text alone is too short to say where it goes. It
   * must start with the visible text, so voice control can use what the person sees. The result
   * bar builds its name from hidden text instead, because its visible text is several pieces.
   */
  readonly label?: string;
  readonly onClick: () => void;
}

/** A link inside the page that runs `onClick` instead of jumping to its anchor. */
export function InPageAnchor({ link }: { readonly link: InPageLink }) {
  return (
    <a
      href={link.href}
      aria-label={link.label}
      onClick={(event) => {
        event.preventDefault();
        link.onClick();
      }}
    >
      {link.text}
    </a>
  );
}

/** Links joined as a list in the page's language: "a", "a y b", "a, b y c". */
export function LinkList({ links }: { readonly links: readonly InPageLink[] }) {
  const t = useTexts();
  return (
    <>
      {links.map((link, index) => (
        <span key={link.key}>
          {t.listSeparator(index, links.length)}
          <InPageAnchor link={link} />
        </span>
      ))}
    </>
  );
}
