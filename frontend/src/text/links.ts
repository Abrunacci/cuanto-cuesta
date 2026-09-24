/** Split text into plain parts and URLs, so the screen can render the URLs as links. */

export type TextPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly url: string };

const URL = /https?:\/\/[^\s]+/g;
/** Punctuation that closes a sentence or a parenthesis right after a URL. */
const TRAILING = /[).,;:]+$/;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL)) {
    const trailing = TRAILING.exec(match[0])?.[0] ?? "";
    const url = match[0].slice(0, match[0].length - trailing.length);
    if (match.index > last) {
      parts.push({ kind: "text", text: text.slice(last, match.index) });
    }
    parts.push({ kind: "link", url });
    last = match.index + url.length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", text: text.slice(last) });
  }
  return parts;
}
