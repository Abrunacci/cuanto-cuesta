import { splitLinks } from "../text/links.ts";

/** Text with its URLs rendered as links that open in a new tab. */
export function RichText({ text }: { readonly text: string }) {
  return (
    <>
      {splitLinks(text).map((part, index) =>
        part.kind === "text" ? (
          part.text
        ) : (
          <a key={index} href={part.url} target="_blank" rel="noreferrer">
            {new URL(part.url).hostname}
          </a>
        ),
      )}
    </>
  );
}
