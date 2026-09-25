import { describe, expect, it } from "vitest";

import { ROUTES } from "../calculator/index.ts";
import { feesToReview } from "./review.ts";

const route = (id: string) => {
  const found = ROUTES.find((r) => r.id === id);
  if (found === undefined) {
    throw new Error(`No route ${id}`);
  }
  return found;
};
const ids = (list: readonly { fee: { id: string } }[]) => list.map((d) => d.fee.id);

describe("feesToReview", () => {
  it("lists the user-defined and estimated fees of a route, never the verified ones", () => {
    const review = feesToReview(route("binance_bitso"), new Set());
    expect(ids(review.toSet)).toEqual(["p2p_premium"]);
    expect(ids(review.estimated)).toEqual(["payoneer_p2p_transfer", "binance_p2p_taker"]);
    expect(review.own).toEqual([]);
  });

  it("moves the fees the person set to their own, whatever the value", () => {
    const review = feesToReview(
      route("binance_bitso"),
      new Set(["p2p_premium", "binance_p2p_taker"]),
    );
    expect(ids(review.toSet)).toEqual([]);
    expect(ids(review.estimated)).toEqual(["payoneer_p2p_transfer"]);
    expect(ids(review.own)).toEqual(["p2p_premium", "binance_p2p_taker"]);
  });

  it("lists a verified fee the person set as their own", () => {
    expect(ids(feesToReview(route("binance_bitso"), new Set(["bitso_taker"])).own)).toEqual([
      "bitso_taker",
    ]);
  });

  it("ignores the person's fees from other routes", () => {
    const review = feesToReview(route("arq"), new Set(["p2p_premium"]));
    expect(review.own).toEqual([]);
  });
});
