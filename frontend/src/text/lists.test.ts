import { describe, expect, it } from "vitest";

import { joinSpanish } from "./lists.ts";

describe("joinSpanish", () => {
  it.each([
    [[], ""],
    [["a"], "a"],
    [["a", "b"], "a y b"],
    [["a", "b", "c"], "a, b y c"],
  ])("joins %j as %j", (items, expected) => {
    expect(joinSpanish(items)).toBe(expected);
  });
});
