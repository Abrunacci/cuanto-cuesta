/**
 * Split text into plain parts and links, so the screen can render the links. A link is either a
 * bare URL or a phrase in Markdown form, "[texto](url)", when the text should read as the link.
 */

export type TextPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly url: string; readonly text: string | null };

/** A Markdown link, or a bare URL. A Markdown link's URL cannot contain parentheses. */
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s]+/g;
/** Punctuation that closes a sentence or a parenthesis right after a bare URL. */
const TRAILING = /[).,;:]+$/;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, phrase, markdownUrl] = match;
    let url: string;
    let length: number;
    if (phrase !== undefined && markdownUrl !== undefined) {
      url = markdownUrl;
      length = whole.length;
    } else {
      const trailing = TRAILING.exec(whole)?.[0] ?? "";
      url = whole.slice(0, whole.length - trailing.length);
      length = url.length;
    }
    if (match.index > last) {
      parts.push({ kind: "text", text: text.slice(last, match.index) });
    }
    parts.push({ kind: "link", url, text: phrase ?? null });
    last = match.index + length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", text: text.slice(last) });
  }
  return parts;
}
