import { describe, expect, it } from "vitest";

import { FEE_DEFAULTS, ROUTES, routesInOrder, type CompleteRoute } from "../calculator/index.ts";
import { es } from "../i18n/es.ts";
import { initialTexts, readForm, type FormTexts } from "./form.ts";
import { difference, feesToReview, resultChecksText, reviewSummary } from "./review.ts";

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
    const review = feesToReview(route("binance_p2p_bitso"), new Set());
    expect(ids(review.toSet)).toEqual(["p2p_premium"]);
    expect(ids(review.estimated)).toEqual(["payoneer_p2p_transfer", "binance_p2p_taker"]);
    expect(review.own).toEqual([]);
  });

  it("moves the fees the person set to their own, whatever the value", () => {
    const review = feesToReview(
      route("binance_p2p_bitso"),
      new Set(["p2p_premium", "binance_p2p_taker"]),
    );
    expect(ids(review.toSet)).toEqual([]);
    expect(ids(review.estimated)).toEqual(["payoneer_p2p_transfer"]);
    expect(ids(review.own)).toEqual(["p2p_premium", "binance_p2p_taker"]);
  });

  it("lists a verified fee the person set as their own", () => {
    expect(ids(feesToReview(route("binance_p2p_bitso"), new Set(["bitso_taker"])).own)).toEqual([
      "bitso_taker",
    ]);
  });

  it("ignores the person's fees from other routes", () => {
    const review = feesToReview(route("arq"), new Set(["p2p_premium"]));
    expect(review.own).toEqual([]);
  });
});

describe("reviewSummary", () => {
  const fees = (...feeIds: string[]) =>
    feeIds.map((id) => {
      const found = FEE_DEFAULTS.find((d) => d.fee.id === id);
      if (found === undefined) {
        throw new Error(`No fee ${id}`);
      }
      return found;
    });

  it("counts the values to set and the estimates, in the plural", () => {
    expect(
      reviewSummary(es, {
        toSet: fees("p2p_premium", "p2p_premium"),
        estimated: fees("payoneer_p2p_transfer", "binance_p2p_taker"),
        own: [],
      }),
    ).toBe("Qué revisar: 2 valores para poner y 2 comisiones estimadas");
  });

  it("counts one of each in the singular, and leaves out what there is none of", () => {
    expect(reviewSummary(es, { toSet: fees("p2p_premium"), estimated: [], own: [] })).toBe(
      "Qué revisar: 1 valor para poner",
    );
    expect(reviewSummary(es, { toSet: [], estimated: fees("binance_p2p_taker"), own: [] })).toBe(
      "Qué revisar: 1 comisión estimada",
    );
  });

  it("does not count the person's own values while there is something to review", () => {
    expect(
      reviewSummary(es, {
        toSet: [],
        estimated: fees("binance_p2p_taker"),
        own: fees("bitso_taker"),
      }),
    ).toBe("Qué revisar: 1 comisión estimada");
  });

  it("counts the person's own values when nothing is left to review", () => {
    expect(reviewSummary(es, { toSet: [], estimated: [], own: fees("bitso_taker") })).toBe(
      "Con tu valor: 1 comisión",
    );
    expect(
      reviewSummary(es, { toSet: [], estimated: [], own: fees("bitso_taker", "p2p_premium") }),
    ).toBe("Con tu valor: 2 comisiones");
  });

  it("has no line for a route with nothing to review and no value of the person's", () => {
    expect(reviewSummary(es, { toSet: [], estimated: [], own: [] })).toBeNull();
  });
});

describe("difference", () => {
  const PRICES = {
    mep: "1.536,16",
    binance_p2p_usdt_usd: "1,03",
    bitso_usdt_ars: "1.596,21",
    arq_usd_ars: "1.593,385",
  };
  /** The fees of these routes set by the person, at their reference values: nothing to review. */
  const settled = (...routeIds: string[]) =>
    new Set(routeIds.flatMap((id) => route(id).steps.flatMap((step) => step.feeIds)));
  /** Per route, in ranking order, the id of the route to review for its difference. */
  const toReview = (overrides: Partial<FormTexts>) => {
    const reading = readForm(es, {
      ...initialTexts(es.numbers),
      amount: "1000",
      prices: PRICES,
      ...overrides,
    });
    return routesInOrder(reading.comparison)
      .filter((r): r is CompleteRoute => r.status === "complete")
      .map((r) => {
        const figure = difference(r, reading.comparison.ranking, reading.ownFees, reading.warnings);
        return [r.route.id, figure.kind === "compared" ? (figure.review?.id ?? null) : figure.kind];
      });
  };

  // Ranking with these prices: Binance P2P + Bitso, which is risky and delivers more than ARQ; ARQ,
  // the best route without risk, compared with Dólar MEP; and Dólar MEP.
  it("is nothing when neither route compared has anything to review", () => {
    expect(toReview({ ownFees: settled("binance_p2p_bitso", "arq", "mep") })).toEqual([
      ["binance_p2p_bitso", null],
      ["arq", null],
      ["mep", null],
    ]);
  });

  it("leaves estimated fees out: they move the result a little and are listed under the route", () => {
    // Only the P2P premium is set: ARQ and the MEP keep their estimated fees.
    expect(toReview({ ownFees: settled("binance_p2p_bitso") })).toEqual([
      ["binance_p2p_bitso", null],
      ["arq", null],
      ["mep", null],
    ]);
  });

  it("points a route at itself when only it has something to review", () => {
    // With the reference values only the P2P premium, still at 0, can change a result.
    expect(toReview({})).toEqual([
      ["binance_p2p_bitso", "binance_p2p_bitso"],
      ["arq", null],
      ["mep", null],
    ]);
  });

  it("points every other route at the one compared with when it has an unusual price", () => {
    // The MEP at 400 is last, and the runner-up without risk: ARQ's difference rests on it.
    expect(
      toReview({ ownFees: settled("binance_p2p_bitso"), prices: { ...PRICES, mep: "400" } }),
    ).toEqual([
      ["binance_p2p_bitso", null],
      ["arq", "mep"],
      ["mep", "mep"],
    ]);
  });

  it("prefers the other route when both have something to review", () => {
    // ARQ at 60,000 delivers most and the MEP at 400 least: both prices are unusual.
    expect(
      toReview({
        ownFees: settled("binance_p2p_bitso"),
        prices: { ...PRICES, arq_usd_ars: "60.000", mep: "400" },
      }),
    ).toEqual([
      ["arq", "mep"],
      ["binance_p2p_bitso", "arq"],
      ["mep", "arq"],
    ]);
  });

  it("counts an unusual price of the other route", () => {
    // ARQ at 60,000 delivers most, ahead of the risky route too.
    expect(
      toReview({
        ownFees: settled("binance_p2p_bitso", "arq", "mep"),
        prices: { ...PRICES, arq_usd_ars: "60.000" },
      }),
    ).toEqual([
      ["arq", "arq"],
      ["binance_p2p_bitso", "arq"],
      ["mep", "arq"],
    ]);
  });

  it("has nothing to compare a lone route with", () => {
    const only = { ...PRICES, binance_p2p_usdt_usd: "", arq_usd_ars: "" };
    expect(toReview({ prices: only })).toEqual([["mep", "alone"]]);
  });
});

describe("resultChecksText", () => {
  it("counts what can change a result, in words", () => {
    expect(resultChecksText(es, { toSet: 1, unusual: 0 })).toBe("1 valor para poner");
    expect(resultChecksText(es, { toSet: 0, unusual: 2 })).toBe("2 precios inusuales");
    expect(resultChecksText(es, { toSet: 1, unusual: 1 })).toBe(
      "1 valor para poner y 1 precio inusual",
    );
  });

  it("is nothing when there is nothing to check", () => {
    expect(resultChecksText(es, { toSet: 0, unusual: 0 })).toBeNull();
  });
});
