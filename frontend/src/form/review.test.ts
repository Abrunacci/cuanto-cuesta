import { describe, expect, it } from "vitest";

import { FEE_DEFAULTS, ROUTES } from "../calculator/index.ts";
import { feesToReview } from "./review.ts";

const route = (id: string) => {
  const found = ROUTES.find((r) => r.id === id);
  if (found === undefined) {
    throw new Error(`No route ${id}`);
  }
  return found;
};
const ids = (list: readonly { fee: { id: string } }[]) => list.map((d) => d.fee.id);
const allUnchanged = new Set(FEE_DEFAULTS.map((d) => d.fee.id));

describe("feesToReview", () => {
  it("lists the user-defined and estimated fees of a route, never the verified ones", () => {
    const review = feesToReview(route("binance_bitso"), allUnchanged);
    expect(ids(review.toSet)).toEqual(["p2p_premium"]);
    expect(ids(review.estimated)).toEqual(["payoneer_p2p_transfer", "binance_p2p_taker"]);
  });

  it("leaves out fees the person changed", () => {
    const changed = new Set([...allUnchanged].filter((id) => id !== "binance_p2p_taker"));
    expect(ids(feesToReview(route("binance_bitso"), changed).estimated)).toEqual([
      "payoneer_p2p_transfer",
    ]);
  });

  it("lists nothing when every estimate and user-defined fee was changed", () => {
    const review = feesToReview(route("arq"), new Set(["arq_ach_deposit", "arq_ars_withdrawal"]));
    expect(review).toEqual({ toSet: [], estimated: [] });
  });
});
