import { describe, expect, it } from "vitest";

import { initialTexts, readForm, type FormTexts } from "./form.ts";
import { commonMissing } from "./missing.ts";
import { barText, summaryText } from "./summary.ts";

const PRICES = {
  mep: "1.536,16",
  p2p_usdt_usd: "1,03",
  bitso_usdt_ars: "1.596,21",
  arq_usd_ars: "1.593,385",
};
const read = (overrides: Partial<FormTexts>) => readForm({ ...initialTexts(), ...overrides });

describe("commonMissing", () => {
  it("is what every route lacks while none can be computed", () => {
    expect(commonMissing(read({}).comparison)).toEqual([
      { kind: "amount" },
      { kind: "rate", key: "mep" },
    ]);
  });

  it("is empty as soon as one route can be computed", () => {
    const partial = read({ amount: "1000", prices: { ...PRICES, bitso_usdt_ars: "" } });
    expect(partial.comparison.routes.some((r) => r.status === "complete")).toBe(true);
    expect(commonMissing(partial.comparison)).toEqual([]);
  });
});

describe("barText", () => {
  it("names the best route and what reaches the bank", () => {
    const reading = read({ amount: "1000", prices: PRICES });
    expect(barText(reading, [])).toEqual({
      kind: "best",
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
      fees: {
        ...initialTexts().fees,
        p2p_premium: "0,1",
        payoneer_p2p_transfer: "3",
        binance_p2p_taker: "0,07",
      },
    });
    const text = barText(reading, []);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", false]);
  });

  it.each([
    ["the P2P premium is still at 0", { payoneer_p2p_transfer: "3", binance_p2p_taker: "0,07" }],
    ["a fee is still an estimate", { p2p_premium: "0,1", binance_p2p_taker: "0,07" }],
  ])("asks to review the best route while %s", (_, fees) => {
    const reading = read({
      amount: "1000",
      prices: PRICES,
      fees: { ...initialTexts().fees, ...fees },
    });
    const text = barText(reading, []);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", true]);
  });

  it("asks to review a best route computed with an unusual price", () => {
    const reading = read({
      amount: "1000",
      prices: { ...PRICES, bitso_usdt_ars: "60.000" },
      fees: {
        ...initialTexts().fees,
        p2p_premium: "0,1",
        payoneer_p2p_transfer: "3",
        binance_p2p_taker: "0,07",
      },
    });
    const text = barText(reading, []);
    expect(text.kind === "best" && [text.routeId, text.review]).toEqual(["binance_bitso", true]);
  });

  it("says what is missing while no route can be computed", () => {
    const reading = read({});
    expect(barText(reading, [])).toEqual({
      kind: "pending",
      text: "Falta completar: monto en USD y dólar MEP (compra).",
    });
  });

  it("asks to review a wrong amount or MEP before listing what is missing", () => {
    const reading = read({ amount: "0" });
    expect(barText(reading, ["el monto"])).toEqual({
      kind: "pending",
      text: "Revisá el monto: tiene un valor que no se puede usar.",
    });
  });

  it("points to each route when none can be computed and nothing is missing in all", () => {
    // Binance and ARQ lack their prices; the MEP route lacks a fee: nothing is common.
    const reading = read({
      amount: "1000",
      prices: { ...PRICES, p2p_usdt_usd: "", arq_usd_ars: "" },
      fees: { ...initialTexts().fees, broker_buy: "" },
    });
    expect(reading.comparison.routes.every((r) => r.status === "incomplete")).toBe(true);
    expect(barText(reading, [])).toEqual({
      kind: "pending",
      text: "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
    });
  });
});

describe("summaryText", () => {
  it("gives the amount at the MEP and the best route", () => {
    const reading = read({ amount: "1000", prices: PRICES });
    expect(summaryText(reading.comparison, [])).toBe(
      "Al dólar MEP serían $\u00a01.536.160,00. Mejor ruta: Binance P2P + Bitso, llegan $\u00a01.534.005,69.",
    );
  });
});
