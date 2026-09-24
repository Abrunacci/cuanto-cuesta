import { splitLinks } from "../text/links.ts";
import { ExternalLink } from "./ExternalLink.tsx";

/** Text with its URLs rendered as links that open in a new tab. */
export function RichText({ text }: { readonly text: string }) {
  return (
    <>
      {splitLinks(text).map((part, index) =>
        part.kind === "text" ? (
          part.text
        ) : (
          <ExternalLink key={index} href={part.url} label={linkText(part.url)}>
            {linkText(part.url)}
          </ExternalLink>
        ),
      )}
    </>
  );
}

/** A short name for a URL: a PDF's file name with its site, otherwise the site. */
function linkText(url: string): string {
  if (!URL.canParse(url)) {
    return url;
  }
  const { hostname, pathname } = new URL(url);
  const file = pathname.split("/").at(-1) ?? "";
  return file.toLowerCase().endsWith(".pdf") ? `${file} (${hostname})` : hostname;
}
