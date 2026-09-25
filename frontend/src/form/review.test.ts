import { describe, expect, it } from "vitest";

import { ROUTES, type CompleteRoute } from "../calculator/index.ts";
import { initialTexts, readForm, type FormTexts } from "./form.ts";
import { differenceToReview, feesToReview } from "./review.ts";

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

describe("differenceToReview", () => {
  const PRICES = {
    mep: "1.536,16",
    p2p_usdt_usd: "1,03",
    bitso_usdt_ars: "1.596,21",
    arq_usd_ars: "1.593,385",
  };
  /** The fees of these routes set by the person, at their reference values: nothing to review. */
  const settled = (...routeIds: string[]) =>
    new Set(routeIds.flatMap((id) => route(id).steps.flatMap((step) => step.feeIds)));
  /** Per route, in ranking order, the id of the route to review for its difference. */
  const toReview = (overrides: Partial<FormTexts>) => {
    const reading = readForm({ ...initialTexts(), amount: "1000", prices: PRICES, ...overrides });
    return reading.comparison.routes
      .filter((r): r is CompleteRoute => r.status === "complete")
      .map((r) => [
        r.route.id,
        differenceToReview(r, reading.ownFees, reading.warnings)?.id ?? null,
      ]);
  };

  // Ranking with these prices: Binance P2P + Bitso, ARQ, Dólar MEP.
  it("is nothing when neither route compared has anything to review", () => {
    expect(toReview({ ownFees: settled("binance_bitso", "arq", "mep") })).toEqual([
      ["binance_bitso", null],
      ["arq", null],
      ["mep", null],
    ]);
  });

  it("points a trailing route at the best one when only the best has something to review", () => {
    expect(toReview({ ownFees: settled("arq", "mep") })).toEqual([
      ["binance_bitso", "binance_bitso"],
      ["arq", "binance_bitso"],
      ["mep", "binance_bitso"],
    ]);
  });

  it("points a route at itself when only it has something to review", () => {
    // ARQ is the runner-up, so the best route's difference rests on it too.
    expect(toReview({ ownFees: settled("binance_bitso", "mep") })).toEqual([
      ["binance_bitso", "arq"],
      ["arq", "arq"],
      ["mep", null],
    ]);
  });

  it("prefers the other route when both have something to review", () => {
    // With the reference values every route has estimates.
    expect(toReview({})).toEqual([
      ["binance_bitso", "arq"],
      ["arq", "binance_bitso"],
      ["mep", "binance_bitso"],
    ]);
  });

  it("counts an unusual price of the other route", () => {
    expect(
      toReview({
        ownFees: settled("binance_bitso", "arq", "mep"),
        prices: { ...PRICES, bitso_usdt_ars: "60.000" },
      }),
    ).toEqual([
      ["binance_bitso", "binance_bitso"],
      ["arq", "binance_bitso"],
      ["mep", "binance_bitso"],
    ]);
  });

  it("is nothing for a route with no other to compare with", () => {
    const only = { ...PRICES, p2p_usdt_usd: "", arq_usd_ars: "" };
    expect(toReview({ prices: only })).toEqual([["mep", null]]);
  });
});
