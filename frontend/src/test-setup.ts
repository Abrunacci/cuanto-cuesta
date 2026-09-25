import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { scrollIntoView } from "./test-scroll.ts";

Element.prototype.scrollIntoView = scrollIntoView;

afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  // The form remembers what was typed: every test starts from a first visit.
  localStorage.clear();
});
