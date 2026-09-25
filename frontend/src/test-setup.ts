import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // The form remembers what was typed: every test starts from a first visit.
  localStorage.clear();
});
