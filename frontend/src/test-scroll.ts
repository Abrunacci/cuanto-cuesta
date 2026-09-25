import { vi } from "vitest";

/**
 * jsdom does not lay out the page, so it has no `scrollIntoView`; `test-setup.ts` installs this
 * mock in its place and tests check the calls. The screenshots check where elements land.
 */
export const scrollIntoView = vi.fn<(this: Element, options?: ScrollIntoViewOptions) => void>();
