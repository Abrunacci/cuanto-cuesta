import { vi } from "vitest";

/**
 * jsdom does not lay out the page, so it has no `scrollIntoView`; `test-setup.ts` installs this
 * mock in its place. Tests check which element is scrolled and how; where it lands depends on the
 * layout, which no test here computes: it was measured by hand in a browser.
 */
export const scrollIntoView = vi.fn<(this: Element, options?: ScrollIntoViewOptions) => void>();
