import { describe, expect, it } from "vitest";

import { compareRoutes, fixedFee, routesInOrder, type Route } from "../calculator/index.ts";
import { validAmount, validPrice } from "../calculator/sample.fixture.ts";
import { es } from "../i18n/es.ts";
import type { Texts } from "../i18n/index.ts";
import { CARD_KEY } from "../quotes/quotes.ts";
import { initialTexts, readForm, type FormTexts } from "./form.ts";
import { commonMissing } from "./missing.ts";
import { barText, hasAmountProblem, summaryText } from "./summary.ts";

const PRICES = {
  mep: "1.536,16",
  binance_p2p_usdt_usd: "1,03",
  bitso_usdt_ars: "1.596,21",
  arq_usd_ars: "1.593,385",
};
/** Spanish, with names for the test routes a, b, c and d. */
const T: Texts = {
  ...es,
  routes: {
    ...es.routes,
    ...Object.fromEntries(
      ["a", "b", "c", "d"].map((id) => [id, { name: `Ruta ${id.toUpperCase()}`, warnings: [] }]),
    ),
  },
};
const read = (overrides: Partial<FormTexts>) =>
  readForm(T, { ...initialTexts(es.numbers), ...overrides });
/**
 * The card route ahead of the MEP, with the card's price left empty and taken from its estimate
 * (1000 USD x 0,99 USDT, after the card's fee, x 1.700 ARS, against 1000 x 1.500).
 */
const CARD_AHEAD = {
  amount: "1000",
  prices: { mep: "1.500", binance_p2p_usdt_usd: "", bitso_usdt_ars: "1.700", arq_usd_ars: "" },
};
const CARD_ESTIMATE = new Map([[CARD_KEY, validPrice("0.99")]]);
const readEstimated = (overrides: Partial<FormTexts>) =>
  readForm(T, { ...initialTexts(es.numbers), ...overrides }, CARD_ESTIMATE);
/** Fees the person typed: their values, marked as their own. */
const typed = (fees: Readonly<Record<string, string>>) => ({
  fees: { ...initialTexts(es.numbers).fees, ...fees },
  ownFees: new Set(Object.keys(fees)),
});
const ALL_SET = { p2p_premium: "0,1", payoneer_p2p_transfer: "3", binance_p2p_taker: "0,07" };
/** ARQ's estimates, set by the person. */
const ARQ_SET = { payoneer_us_withdrawal: "4", arq_usd_usdc_conversion: "0" };
/** The example from the issue: ARQ's price left empty. */
const EXAMPLE = {
  amount: "1500",
  prices: { mep: "1500", binance_p2p_usdt_usd: "1", bitso_usdt_ars: "1600", arq_usd_ars: "" },
};
/** Only Binance P2P + Bitso, which is risky, can be computed. */
const ONLY_P2P = { ...EXAMPLE, prices: { ...EXAMPLE.prices, mep: "" } };
/** Only the MEP route can be computed. */
const ONLY_MEP = {
  amount: "1000",
  prices: { mep: "1.536,16", binance_p2p_usdt_usd: "", bitso_usdt_ars: "", arq_usd_ars: "" },
};

/** A route converting at the MEP after one fee, named "Ruta <ID>" in `T`. */
function testRoute(id: string, fee: string, risky = false): Route {
  return {
    id,
    source: "USD",
    target: "ARS",
    steps: [{ id: "s", feeIds: [fee], conversion: { rateKey: "mep", target: "ARS" } }],
    risk: risky ? "account_block" : null,
  };
}

/**
 * Routes A and B (and D, when asked) deliver the same (1000 x 1500, no fees); C pays a 1 USD fee
 * and trails by 1500. The routes named in `risky` are risky.
 */
function tiedComparison(withD = false, risky: readonly string[] = []) {
  const route = (id: string, fee: string) => testRoute(id, fee, risky.includes(id));
  return comparisonOf([
    route("c", "one"),
    route("a", "zero"),
    route("b", "zero"),
    ...(withD ? [route("d", "zero")] : []),
  ]);
}

/** Two risky routes: A delivers 1500 more than C. */
function riskyComparison() {
  return comparisonOf([testRoute("c", "one", true), testRoute("a", "zero", true)]);
}

function comparisonOf(routes: readonly Route[]) {
  return compareRoutes({
    routes,
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

/**
 * Route a ends in ARS and route b in USD; compared in USD, a fails. Compared in USDT, both fail.
 * Without the amount, a route that does not fail is incomplete.
 */
function withFailures(target: "USD" | "USDT", amount: string | null = "1000") {
  const route = (id: string, end: "ARS" | "USD") => ({
    id,
    source: "USD" as const,
    target: end,
    steps:
      end === "ARS"
        ? [{ id: "s", feeIds: ["zero"], conversion: { rateKey: "mep", target: "ARS" as const } }]
        : [{ id: "s", feeIds: ["zero"], conversion: null }],
    risk: null,
  });
  return compareRoutes({
    routes: [route("a", "ARS"), route("b", "USD")],
    target,
    rateDefinitions: [{ key: "mep", base: "USD", quote: "ARS" }],
    amount: amount === null ? null : validAmount(amount),
    prices: new Map([["mep", validPrice("1500")]]),
    fees: new Map([["zero", fixedFee("zero", "0", "USD")]]),
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
  // With PRICES, Binance P2P + Bitso delivers most (1534005.69) but is risky: the bar shows ARQ
  // (1524869.44), the best route without risk.
  it("names the best route without risk and what reaches the bank", () => {
    const reading = read({ amount: "1000", prices: PRICES });
    expect(barText(T, reading, false)).toEqual({
      kind: "best",
      lead: "best",
      route: "ARQ (ex DolarApp)",
      routeId: "arq",
      amount: "$\u00a01.524.869,44",
      amountWhole: "$\u00a01.524.869",
      // Two of ARQ's fees are estimates, which do not count.
      review: null,
      estimated: false,
      risk: null,
    });
  });

  it("says which unusual price the best route was computed with", () => {
    const reading = read({
      amount: "1000",
      prices: { ...PRICES, arq_usd_ars: "60.000" },
      ...typed(ARQ_SET),
    });
    const text = barText(T, reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual([
      "arq",
      "1 precio inusual",
    ]);
  });

  it("marks a lone risky route as risky", () => {
    expect(barText(T, read(ONLY_P2P), false)).toMatchObject({
      kind: "best",
      lead: "alone",
      route: "Binance P2P + Bitso",
      risk: "account_block",
    });
  });

  it("asks to review a lone risky route while the P2P premium is still at 0", () => {
    const reading = read({
      ...ONLY_P2P,
      ...typed({ payoneer_p2p_transfer: "3", binance_p2p_taker: "0,07" }),
    });
    const text = barText(T, reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual([
      "binance_p2p_bitso",
      "1 valor para poner",
    ]);
  });

  it("has nothing to review once the premium is set by hand to 0, its default", () => {
    const reading = read({
      ...ONLY_P2P,
      ...typed({ ...ALL_SET, p2p_premium: "0" }),
    });
    const text = barText(T, reading, false);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual([
      "binance_p2p_bitso",
      null,
    ]);
  });

  it("leads with the risky route that delivers most when every route computed is risky", () => {
    const reading = { ...read({ amount: "1000" }), comparison: riskyComparison() };
    expect(barText(T, reading, false)).toMatchObject({
      kind: "best",
      lead: "risky",
      route: "Ruta A",
      risk: "account_block",
    });
  });

  it("says what is missing while no route can be computed", () => {
    const reading = read({});
    expect(barText(T, reading, false)).toEqual({
      kind: "pending",
      text: "Falta completar: monto en USD.",
      short: "Falta: monto",
    });
  });

  it("asks to review a wrong amount before listing what is missing", () => {
    const reading = read({ amount: "0" });
    expect(hasAmountProblem(reading)).toBe(true);
    expect(barText(T, reading, hasAmountProblem(reading))).toEqual({
      kind: "pending",
      text: "Revisá el monto: tiene un valor que no se puede usar.",
      short: "Revisá: monto",
    });
  });

  it("points to each route when the amount is fine and no route has its prices", () => {
    const reading = read({ amount: "1000" });
    expect(barText(T, reading, hasAmountProblem(reading))).toMatchObject({
      kind: "pending",
      short: "Mirá qué le falta a cada ruta",
    });
  });

  it("computes the other routes when only the MEP is wrong", () => {
    const reading = read({ amount: "1000", prices: { ...PRICES, mep: "-1" } });
    expect(hasAmountProblem(reading)).toBe(false);
    expect(barText(T, reading, false)).toMatchObject({
      kind: "best",
      lead: "best",
      route: "ARQ (ex DolarApp)",
    });
  });

  it("names the tied routes together", () => {
    const reading = { ...read({ amount: "1000" }), comparison: tiedComparison() };
    expect(barText(T, reading, false)).toMatchObject({
      kind: "best",
      lead: "tied",
      route: "Ruta A y Ruta B",
      amount: "$\u00a01.500.000,00",
    });
  });

  it("says when the route shown is the only one computed", () => {
    expect(barText(T, read(ONLY_MEP), false)).toMatchObject({
      kind: "best",
      lead: "alone",
      route: "Dólar MEP",
    });
  });

  it("points to each route when none can be computed and nothing is missing in all", () => {
    // Binance and ARQ lack their prices; the MEP route lacks a fee: nothing is common.
    const reading = read({
      amount: "1000",
      prices: { ...PRICES, binance_p2p_usdt_usd: "", arq_usd_ars: "" },
      fees: { ...initialTexts(es.numbers).fees, broker_buy: "" },
    });
    expect(routesInOrder(reading.comparison).every((r) => r.status === "incomplete")).toBe(true);
    expect(barText(T, reading, false)).toEqual({
      kind: "pending",
      text: "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
      short: "Mirá qué le falta a cada ruta",
    });
  });
});

describe("a lead computed with the card's estimated price", () => {
  it("is marked in the summary and in the bar", () => {
    const reading = readEstimated(CARD_AHEAD);
    expect(summaryText(T, reading.comparison, false, reading.estimated)).toMatch(
      /^Mejor ruta: Binance con tarjeta \+ Bitso, con precio estimado, llegan /,
    );
    expect(barText(T, reading, false)).toMatchObject({
      kind: "best",
      routeId: "binance_card_bitso",
      estimated: true,
    });
  });

  it("is not marked once the person types the card's price", () => {
    const reading = readEstimated({
      ...CARD_AHEAD,
      prices: { ...CARD_AHEAD.prices, [CARD_KEY]: "0,99" },
    });
    expect(summaryText(T, reading.comparison, false, reading.estimated)).not.toContain("estimado");
    expect(barText(T, reading, false)).toMatchObject({
      routeId: "binance_card_bitso",
      estimated: false,
    });
  });

  it("is not marked when the best route does not use the estimate", () => {
    // The MEP at 2.000 beats the card route, which still uses the estimate.
    const reading = readEstimated({
      ...CARD_AHEAD,
      prices: { ...CARD_AHEAD.prices, mep: "2.000" },
    });
    expect(reading.estimated.has(CARD_KEY)).toBe(true);
    expect(summaryText(T, reading.comparison, false, reading.estimated)).toMatch(
      /^Mejor ruta: Dólar MEP, llegan /,
    );
    expect(barText(T, reading, false)).toMatchObject({ routeId: "mep", estimated: false });
  });
});

describe("summaryText", () => {
  it("gives the best route without risk, and how much more the risky one leaves", () => {
    const reading = read({ amount: "1000", prices: PRICES });
    // ARQ 1524869.44 - MEP 1503624.13 = 21245.31; Binance 1534005.69 - ARQ = 9136.25
    expect(summaryText(T, reading.comparison, false)).toBe(
      "Mejor ruta: ARQ (ex DolarApp), llegan $\u00a01.524.869,44: $\u00a021.245,31 más que Dólar MEP. " +
        "Binance P2P + Bitso deja $\u00a09.136,25 más, con riesgo de bloqueo de tu cuenta de Binance.",
    );
  });

  it("says nothing of a risky route that leaves less than the best one", () => {
    // Bitso at 1.500: Binance delivers 1000 / 1.03 ... x 1500, less than ARQ.
    const reading = read({ amount: "1000", prices: { ...PRICES, bitso_usdt_ars: "1.500" } });
    expect(summaryText(T, reading.comparison, false)).toBe(
      "Mejor ruta: ARQ (ex DolarApp), llegan $\u00a01.524.869,44: $\u00a021.245,31 más que Dólar MEP.",
    );
  });

  it("compares with no route when every other route computed is risky, in the example", () => {
    // ARQ has no price; 2378992.00 - 2202330.00 = 176662.00
    expect(summaryText(T, read(EXAMPLE).comparison, false)).toBe(
      "Mejor ruta: Dólar MEP, llegan $\u00a02.202.330,00. " +
        "Binance P2P + Bitso deja $\u00a0176.662,00 más, con riesgo de bloqueo de tu cuenta de Binance.",
    );
  });

  it("says the only route computed is risky", () => {
    const reading = read({ ...EXAMPLE, prices: { ...EXAMPLE.prices, mep: "" } });
    expect(summaryText(T, reading.comparison, false)).toBe(
      "Por ahora solo se puede calcular Binance P2P + Bitso, con riesgo de bloqueo de tu cuenta de Binance: llegan $\u00a02.378.992,00.",
    );
  });

  it("recommends none when every route computed is risky", () => {
    expect(summaryText(T, riskyComparison(), false)).toBe(
      "Por ahora solo se pueden calcular rutas con riesgo: Ruta A, llegan $\u00a01.500.000,00, con riesgo de bloqueo de tu cuenta de Binance.",
    );
  });

  it("leaves a risky route tied with the best one out of the tie", () => {
    expect(summaryText(T, tiedComparison(false, ["b"]), false)).toBe(
      "Mejor ruta: Ruta A, llegan $\u00a01.500.000,00: $\u00a01.500,00 más que Ruta C.",
    );
  });

  it("names the tied routes", () => {
    expect(summaryText(T, tiedComparison(), false)).toBe(
      "Empatan Ruta A y Ruta B: llegan $\u00a01.500.000,00.",
    );
  });

  it("names every tied route, not only the runner-up", () => {
    expect(summaryText(T, tiedComparison(true), false)).toBe(
      "Empatan Ruta A, Ruta B y Ruta D: llegan $\u00a01.500.000,00.",
    );
  });

  it("says no route can be computed when every route's data is wrong", () => {
    const comparison = withFailures("USDT");
    expect(comparison.failed).toHaveLength(2);
    const text =
      "No se puede calcular ninguna ruta: hay un problema con las cotizaciones o comisiones que usan. No es un error en lo que cargaste.";
    const bar = { kind: "pending", text, short: "Ninguna ruta se puede calcular" };
    expect(summaryText(T, comparison, false)).toBe(text);
    expect(barText(T, { ...read({}), comparison }, false)).toEqual(bar);
    // A wrong amount (read as none) would not make any route computable either.
    const withoutAmount = withFailures("USDT", null);
    expect(withoutAmount.failed).toHaveLength(2);
    expect(summaryText(T, withoutAmount, true)).toBe(text);
    expect(barText(T, { ...read({}), comparison: withoutAmount }, true)).toEqual(bar);
  });

  it("asks for what is missing when some routes failed and the rest are incomplete", () => {
    const comparison = withFailures("USD", null);
    expect([comparison.failed.length, comparison.incomplete.length]).toEqual([1, 1]);
    expect(summaryText(T, comparison, false)).toBe("Completá el monto para comparar las rutas.");
    expect(barText(T, { ...read({}), comparison }, false)).toMatchObject({
      kind: "pending",
      short: "Falta: monto",
    });
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
    expect(summaryText(T, read(texts).comparison, problem)).toBe(expected);
  });
});
