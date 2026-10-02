import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { scrollIntoView } from "./test-scroll.ts";

Element.prototype.scrollIntoView = scrollIntoView;

// jsdom's browser is in English; the page is tested in Spanish, its default, unless a test asks
// for English (with the selector, `?lang=en` or its own browser languages).
Object.defineProperty(navigator, "languages", { configurable: true, get: () => ["es-AR"] });

// No backend in tests: the latest prices never arrive unless a test passes its own `loadRates`.
vi.stubGlobal("fetch", () => new Promise<never>(() => undefined));

afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  // The form remembers what was typed: every test starts from a first visit.
  localStorage.clear();
});
