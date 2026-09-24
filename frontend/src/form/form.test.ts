import { describe, expect, it } from "vitest";

import type { Comparison } from "../calculator/index.ts";
import { fieldId, initialTexts, readForm, type FormTexts } from "./form.ts";

const PRICES = {
  mep: "1.536,16",
  p2p_usdt_usd: "1,03",
  bitso_usdt_ars: "1.596,21",
  arq_usd_ars: "1.593,385",
};

function filled(overrides: Partial<FormTexts> = {}): FormTexts {
  return { ...initialTexts(), amount: "1.000", prices: PRICES, ...overrides };
}

function finals(comparison: Comparison) {
  return comparison.routes.map((r) =>
    r.status === "complete" ? [r.route.id, r.result.final.amount.toFixed(2)] : [r.route.id, null],
  );
}

describe("initialTexts", () => {
  it("starts the amount and every price empty", () => {
    const texts = initialTexts();
    expect(texts.amount).toBe("");
    expect(Object.values(texts.prices)).toEqual(["", "", "", ""]);
  });

  it("starts every fee at its researched value, in Argentine notation", () => {
    const texts = initialTexts();
    expect(texts.fees.bitso_taker).toBe("0,6");
    expect(texts.fees.payoneer_p2p_transfer).toBe("4");
    expect(texts.fees.arq_usd_usdc_conversion).toBe("0");
    expect(texts.minimums).toEqual({ payoneer_us_withdrawal: "20" });
  });
});

describe("readForm", () => {
  it("computes nothing until the amount and prices are typed", () => {
    const { comparison, problems } = readForm(initialTexts());
    expect(comparison.routes.every((r) => r.status === "incomplete")).toBe(true);
    expect(problems.size).toBe(0);
  });

  it("computes the three routes with the researched fees", () => {
    // Same values as the calculator's end-to-end test for 1000 USD.
    expect(finals(readForm(filled()).comparison)).toEqual([
      ["binance_bitso", "1534005.69"],
      ["arq", "1524869.44"],
      ["mep", "1503624.13"],
    ]);
  });

  it("uses an edited fee", () => {
    // Without ARQ's 3 USD: 960.00 x 1593.385 = 1529649.60
    const texts = filled({ fees: { ...initialTexts().fees, arq_ach_deposit: "0" } });
    expect(finals(readForm(texts).comparison)).toContainEqual(["arq", "1529649.60"]);
  });

  it("uses an edited minimum", () => {
    // 100 USD: 4 % is 4.00, so with no minimum ARQ gets 96.00 - 3.00 = 93.00 x 1593.385
    const texts = filled({ amount: "100", minimums: { payoneer_us_withdrawal: "0" } });
    expect(finals(readForm(texts).comparison)).toContainEqual(["arq", "148184.80"]);
  });

  it("leaves a route incomplete when one of its fees is emptied", () => {
    const texts = filled({ fees: { ...initialTexts().fees, bitso_taker: "" } });
    const binance = readForm(texts).comparison.routes.find((r) => r.route.id === "binance_bitso");
    expect(binance?.status === "incomplete" && binance.missing).toEqual([
      { kind: "fee", id: "bitso_taker" },
    ]);
  });

  it("explains a value that is not a number and does not use it", () => {
    const { comparison, problems } = readForm(filled({ amount: "mil" }));
    expect(problems.get(fieldId.amount)).toBe("Escribí un número, por ejemplo 1.234,56.");
    expect(comparison.routes.every((r) => r.status === "incomplete")).toBe(true);
  });

  it.each([
    ["amount", { amount: "0" }, fieldId.amount, "Tiene que ser mayor que 0."],
    ["amount", { amount: "10,005" }, fieldId.amount, "Usá como mucho 2 decimales."],
    ["amount", { amount: "20.000.000" }, fieldId.amount, "Tiene que ser como mucho 10.000.000."],
    [
      "price",
      { prices: { ...PRICES, mep: "-1" } },
      fieldId.price("mep"),
      "Tiene que ser mayor que 0.",
    ],
  ])("explains an invalid %s", (_what, overrides, id, message) => {
    expect(readForm(filled(overrides)).problems.get(id)).toBe(message);
  });

  it("explains fees outside the caps, with their unit", () => {
    const texts = filled({
      fees: { ...initialTexts().fees, bitso_taker: "25", arq_ach_deposit: "-1" },
      minimums: { payoneer_us_withdrawal: "150" },
    });
    const { problems } = readForm(texts);
    expect(problems.get(fieldId.fee("bitso_taker"))).toBe("Como máximo 20 %.");
    expect(problems.get(fieldId.fee("arq_ach_deposit"))).toBe("No puede ser negativo.");
    expect(problems.get(fieldId.minimum("payoneer_us_withdrawal"))).toBe("Como máximo 100 USD.");
  });
});
