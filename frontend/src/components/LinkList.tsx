export interface InPageLink {
  readonly key: string;
  readonly href: string;
  readonly text: string;
  readonly onClick: () => void;
}

/** A link inside the page that runs `onClick` instead of jumping to its anchor. */
export function InPageAnchor({ link }: { readonly link: InPageLink }) {
  return (
    <a
      href={link.href}
      onClick={(event) => {
        event.preventDefault();
        link.onClick();
      }}
    >
      {link.text}
    </a>
  );
}

/** Links joined as a Spanish list: "a", "a y b", "a, b y c". */
export function LinkList({ links }: { readonly links: readonly InPageLink[] }) {
  return (
    <>
      {links.map((link, index) => (
        <span key={link.key}>
          {index === 0 ? "" : index === links.length - 1 ? " y " : ", "}
          <InPageAnchor link={link} />
        </span>
      ))}
    </>
  );
}
