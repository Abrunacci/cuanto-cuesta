/** "a", "a y b", "a, b y c". */
export function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1) ?? ""}`;
}
