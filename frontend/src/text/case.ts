/**
 * A label as it reads inside a sentence: "Recargo P2P" becomes "recargo P2P", but a label that
 * starts with an acronym or a brand ("USDT…", "ARQ…") is left alone.
 */
export function lowerFirst(text: string): string {
  const [first = "", second = ""] = text;
  if (second !== second.toLowerCase()) {
    return text;
  }
  return first.toLowerCase() + text.slice(1);
}
