import { describe, expect, it } from "vitest";

import { compareRoutes, fixedFee, routesInOrder } from "../calculator/index.ts";
import { validAmount, validPrice } from "../calculator/sample.fixture.ts";
import { initialTexts, readForm, type FormTexts } from "./form.ts";
import { commonMissing } from "./missing.ts";
import { barText, hasAmountProblem, summaryText } from "./summary.ts";

const PRICES = {
  mep: "1.536,16",
  p2p_usdt_usd: "1,03",
  bitso_usdt_ars: "1.596,21",
  arq_usd_ars: "1.593,385",
};
const read = (overrides: Partial<FormTexts>) => readForm({ ...initialTexts(), ...overrides });
/** Fees the person typed: their values, marked as their own. */
const typed = (fees: Readonly<Record<string, string>>) => ({
  fees: { ...initialTexts().fees, ...fees },
  ownFees: new Set(Object.keys(fees)),
});
const ALL_SET = { p2p_premium: "0,1", payoneer_p2p_transfer: "3", binance_p2p_taker: "0,07" };
/** The example from the issue: ARQ's price left empty. */
const EXAMPLE = {
  amount: "1500",
  prices: { mep: "1500", p2p_usdt_usd: "1", bitso_usdt_ars: "1600", arq_usd_ars: "" },
};
/** Only the MEP route can be computed. */
const ONLY_MEP = {
  amount: "1000",
  prices: { mep: "1.536,16", p2p_usdt_usd: "", bitso_usdt_ars: "", arq_usd_ars: "" },
};

/** Two routes that deliver the same (1000 x 1500, no fees) and a third 1500 behind. */
/** Routes A and B (and D, when asked) deliver the same; C pays a fee and trails. */
function tiedComparison(withD = false) {
  const route = (id: string, name: string, fee: string) => ({
    id,
    name,
    source: "USD" as const,
    target: "ARS" as const,
    steps: [{ label: "s", feeIds: [fee], conversion: { rateKey: "mep", target: "ARS" as const } }],
    warnings: [],
  });
  return compareRoutes({
    routes: [
      route("c", "Ruta C", "one"),
      route("a", "Ruta A", "zero"),
      route("b", "Ruta B", "zero"),
      ...(withD ? [route("d", "Ruta D", "zero")] : []),
    ],
    target: "ARS",
    rateDefinitions: [{ key: "mep", base: "USD", quote: "ARS" }],
    amount: validAmount("1000"),
    prices: new Map([["mep", validPrice("1500")]]),
    fees: new Map([
      ["zero", fixedFee("zero", "0", "USD")],
      ["one", fixedFee("one", "1", "USD")],
    ]),
  });
}

describe("commonMissing", () => {
  it("is what every route lacks while none can be computed", () => {
    // Each route needs its own prices; only the amount is common to all.
    expect(commonMissing(read({}).comparison)).toEqual([{ kind: "amount" }]);
  });

  it("is empty as soon as one route can be computed", () => {
    const partial = read({ amount: "1000", prices: { ...PRICES, bitso_usdt_ars: "" } });
    expect(routesInOrder(partial.comparison).some((r) => r.status === "complete")).toBe(true);
    expect(commonMissing(partial.comparison)).toEqual([]);
  });
});

describe("barText", () => {
  it("names the best route and what reaches the bank", () => {
    const reading = read({ amount: "1000", prices: PRICES });
    expect(barText(reading, false)).toEqual({
      kind: "best",
      lead: "best",
      route: "Binance P2P + Bitso",
      routeId: "binance_bitso",
      amount: "$\u00a01.534.005,69",
      amountWhole: "$\u00a01.534.005",
      // The P2P premium is still at the 0 the person has to set.
      review: true,
    });
  });

  it("has nothing to review once the best route's estimates and premium are set", () => {
    const reading = read({
      amount: "1000",
      prices: PRICES,
      ...typed(ALL_SET),
    });
    const text = barText(reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", false]);
  });

  it.each([
    ["the P2P premium is still at 0", { payoneer_p2p_transfer: "3", binance_p2p_taker: "0,07" }],
    ["a fee is still an estimate", { p2p_premium: "0,1", binance_p2p_taker: "0,07" }],
  ])("asks to review the best route while %s", (_, fees) => {
    const reading = read({
      amount: "1000",
      prices: PRICES,
      ...typed(fees),
    });
    const text = barText(reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", true]);
  });

  it("has nothing to review once the premium is set by hand to 0, its default", () => {
    const reading = read({
      amount: "1000",
      prices: PRICES,
      ...typed({ ...ALL_SET, p2p_premium: "0" }),
    });
    const text = barText(reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", false]);
  });

  it("asks to review a best route computed with an unusual price", () => {
    const reading = read({
      amount: "1000",
      prices: { ...PRICES, bitso_usdt_ars: "60.000" },
      ...typed(ALL_SET),
    });
    const text = barText(reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", true]);
  });

  it("says what is missing while no route can be computed", () => {
    const reading = read({});
    expect(barText(reading, false)).toEqual({
      kind: "pending",
      text: "Falta completar: monto en USD.",
      short: "Falta: monto",
    });
  });

  it("asks to review a wrong amount before listing what is missing", () => {
    const reading = read({ amount: "0" });
    expect(hasAmountProblem(reading)).toBe(true);
    expect(barText(reading, hasAmountProblem(reading))).toEqual({
      kind: "pending",
      text: "Revisá el monto: tiene un valor que no se puede usar.",
      short: "Revisá: monto",
    });
  });

  it("points to each route when the amount is fine and no route has its prices", () => {
    const reading = read({ amount: "1000" });
    expect(barText(reading, hasAmountProblem(reading))).toMatchObject({
      kind: "pending",
      short: "Mirá qué le falta a cada ruta",
    });
  });

  it("computes the other routes when only the MEP is wrong", () => {
    const reading = read({ amount: "1000", prices: { ...PRICES, mep: "-1" } });
    expect(hasAmountProblem(reading)).toBe(false);
    expect(barText(reading, false)).toMatchObject({
      kind: "best",
      lead: "best",
      route: "Binance P2P + Bitso",
    });
  });

  it("names the tied routes together", () => {
    const reading = { ...read({ amount: "1000" }), comparison: tiedComparison() };
    expect(barText(reading, false)).toMatchObject({
      kind: "best",
      lead: "tied",
      route: "Ruta A y Ruta B",
      amount: "$\u00a01.500.000,00",
    });
  });

  it("says when the route shown is the only one computed", () => {
    expect(barText(read(ONLY_MEP), false)).toMatchObject({
      kind: "best",
      lead: "alone",
      route: "Dólar MEP",
    });
  });

  it("points to each route when none can be computed and nothing is missing in all", () => {
    // Binance and ARQ lack their prices; the MEP route lacks a fee: nothing is common.
    const reading = read({
      amount: "1000",
      prices: { ...PRICES, p2p_usdt_usd: "", arq_usd_ars: "" },
      fees: { ...initialTexts().fees, broker_buy: "" },
    });
    expect(routesInOrder(reading.comparison).every((r) => r.status === "incomplete")).toBe(true);
    expect(barText(reading, false)).toEqual({
      kind: "pending",
      text: "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
      short: "Mirá qué le falta a cada ruta",
    });
  });
});

describe("summaryText", () => {
  it("gives the best route and how much more it leaves than the runner-up", () => {
    const reading = read({ amount: "1000", prices: PRICES });
    // 1534005.69 - 1524869.44 = 9136.25
    expect(summaryText(reading.comparison, false)).toBe(
      "Mejor ruta: Binance P2P + Bitso, llegan $\u00a01.534.005,69: $\u00a09.136,25 más que ARQ (ex DolarApp).",
    );
  });

  it("compares the routes with each other, not with the MEP, in the example", () => {
    // 2378992.00 - 2202330.00 = 176662.00; ARQ has no price and is left out.
    expect(summaryText(read(EXAMPLE).comparison, false)).toBe(
      "Mejor ruta: Binance P2P + Bitso, llegan $\u00a02.378.992,00: $\u00a0176.662,00 más que Dólar MEP.",
    );
  });

  it("computes Binance P2P + Bitso without the MEP", () => {
    const reading = read({ ...EXAMPLE, prices: { ...EXAMPLE.prices, mep: "" } });
    expect(summaryText(reading.comparison, false)).toBe(
      "Por ahora solo se puede calcular Binance P2P + Bitso: llegan $\u00a02.378.992,00.",
    );
  });

  it("names the tied routes", () => {
    expect(summaryText(tiedComparison(), false)).toBe(
      "Empatan Ruta A y Ruta B: llegan $\u00a01.500.000,00.",
    );
  });

  it("names every tied route, not only the runner-up", () => {
    expect(summaryText(tiedComparison(true), false)).toBe(
      "Empatan Ruta A, Ruta B y Ruta D: llegan $\u00a01.500.000,00.",
    );
  });

  it.each([
    [{}, false, "Completá el monto y las cotizaciones para comparar las rutas."],
    [
      { amount: "1000" },
      false,
      "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
    ],
    [{ amount: "0" }, true, "Revisá el monto: tiene un valor que no se puede usar."],
    [{ prices: PRICES }, false, "Completá el monto para comparar las rutas."],
  ])("says what to do while no route can be computed (%o)", (texts, problem, expected) => {
    expect(summaryText(read(texts).comparison, problem)).toBe(expected);
  });
});
