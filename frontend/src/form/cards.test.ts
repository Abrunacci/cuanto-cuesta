import { describe, expect, it } from "vitest";

import type { Route } from "../calculator/index.ts";
import { byCard, cardOf, ownFieldCount } from "./cards.ts";

/** A route whose one step charges these fees. */
const route = (id: string, feeIds: string[]): Route => ({
  id,
  name: id,
  source: "USD",
  target: "ARS",
  steps: [{ label: "s", feeIds, conversion: { rateKey: "mep", target: "ARS" } }],
  warnings: [],
  risk: null,
});

// a holds x and y, b holds z; c uses all three and holds none.
const ROUTES = [route("a", ["x", "y"]), route("b", ["z"]), route("c", ["x", "z", "y"])];

describe("cardOf", () => {
  it("is the first route that uses the fee", () => {
    expect(["x", "y", "z"].map((id) => cardOf(id, ROUTES)?.id)).toEqual(["a", "a", "b"]);
  });

  it("is nothing for a fee no route uses", () => {
    expect(cardOf("w", ROUTES)).toBeUndefined();
  });
});

describe("byCard", () => {
  it("groups a step's fees by the card that holds them, in the order they first appear", () => {
    expect(byCard(["x", "z", "y"], ROUTES).map((group) => [group.card.id, group.feeIds])).toEqual([
      ["a", ["x", "y"]],
      ["b", ["z"]],
    ]);
  });

  it("leaves out a fee no route uses", () => {
    expect(byCard(["w"], ROUTES)).toEqual([]);
  });
});

describe("ownFieldCount", () => {
  it("counts only the person's fees whose fields the route's card holds", () => {
    const own = new Set(["x", "z"]);
    expect(ROUTES.map((r) => ownFieldCount(r, own, ROUTES))).toEqual([1, 1, 0]);
  });
});
