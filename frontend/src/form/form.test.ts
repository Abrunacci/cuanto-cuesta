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
    const { comparison, problems, echoes } = readForm(initialTexts());
    expect(comparison.routes.every((r) => r.status === "incomplete")).toBe(true);
    expect(problems.size).toBe(0);
    expect(echoes.size).toBe(0);
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
    ["amount", { amount: "10,5555" }, fieldId.amount, "Usá como mucho 2 decimales."],
    ["amount", { amount: "20.000.000" }, fieldId.amount, "No puede ser más de 10.000.000."],
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

describe("numbers read a thousand times off", () => {
  const priceOf = (texts: FormTexts, key: string) => {
    const reading = readForm(texts);
    return {
      problem: reading.problems.get(fieldId.price(key)),
      echo: reading.echoes.get(fieldId.price(key)),
    };
  };

  it("rejects a P2P price typed with three decimals and a dot, suggesting the fix", () => {
    // Binance shows P2P prices like 1.030; typed that way it reads as one thousand thirty.
    const texts = filled({ prices: { ...PRICES, p2p_usdt_usd: "1.030" } });
    expect(priceOf(texts, "p2p_usdt_usd").problem).toBe(
      "Leímos 1.030,00 USD por USDT, y lo esperable está entre 0,5 y 2. ¿Quisiste poner 1,03?",
    );
    const binance = readForm(texts).comparison.routes.find((r) => r.route.id === "binance_bitso");
    expect(binance?.status).toBe("incomplete");
  });

  it("rejects a MEP pasted in English notation, suggesting the fix", () => {
    const texts = filled({ prices: { ...PRICES, mep: "1,536" } });
    expect(priceOf(texts, "mep").problem).toBe(
      "Leímos 1,536 ARS por USD, y lo esperable está entre 500 y 50.000. ¿Quisiste poner 1.536?",
    );
  });

  it("rejects an amount with English thousands instead of reading it as 1 USD", () => {
    expect(readForm(filled({ amount: "1,000" })).problems.get(fieldId.amount)).toBe(
      "Usá como mucho 2 decimales. ¿Quisiste poner 1.000?",
    );
  });

  it("says how each valid amount and price was read", () => {
    const texts = filled({ prices: { ...PRICES, p2p_usdt_usd: "1.03" } });
    const { echoes } = readForm(texts);
    expect(echoes.get(fieldId.amount)).toBe("Leímos US$ 1.000,00.");
    expect(echoes.get(fieldId.price("p2p_usdt_usd"))).toBe("Leímos 1,03 USD por USDT.");
    expect(echoes.get(fieldId.price("mep"))).toBe("Leímos 1.536,16 ARS por USD.");
    const integer = readForm(filled({ prices: { ...PRICES, mep: "1.540" } })).echoes;
    // Two decimals, so "1.540" is not echoed back in a form that reads as 1,54.
    expect(integer.get(fieldId.price("mep"))).toBe("Leímos 1.540,00 ARS por USD.");
  });

  it.each([
    ["15", "Leímos 15,00 ARS por USD, y lo esperable está entre 500 y 50.000."],
    ["154000", "Leímos 154.000,00 ARS por USD, y lo esperable está entre 500 y 50.000."],
    ["99,9", "Leímos 99,90 ARS por USD, y lo esperable está entre 500 y 50.000."],
    ["153.616", "Leímos 153.616,00 ARS por USD, y lo esperable está entre 500 y 50.000."],
    ["1.536.160", "Leímos 1.536.160,00 ARS por USD, y lo esperable está entre 500 y 50.000."],
  ])("never suggests a value the person did not type: MEP %s", (text, message) => {
    expect(priceOf(filled({ prices: { ...PRICES, mep: text } }), "mep").problem).toBe(message);
  });

  it("gives up on a price with no plausible fix", () => {
    expect(
      priceOf(filled({ prices: { ...PRICES, p2p_usdt_usd: "50" } }), "p2p_usdt_usd").problem,
    ).toBe("Leímos 50,00 USD por USDT, y lo esperable está entre 0,5 y 2.");
  });
});

describe("invalid fees are never read as zero", () => {
  const route = (texts: FormTexts, id: string) =>
    readForm(texts).comparison.routes.find((r) => r.route.id === id);

  it("leaves the route incomplete when a fee is not a number", () => {
    const texts = filled({ fees: { ...initialTexts().fees, arq_ach_deposit: "abc" } });
    expect(readForm(texts).problems.get(fieldId.fee("arq_ach_deposit"))).toBe(
      "Escribí un número, por ejemplo 1.234,56.",
    );
    expect(route(texts, "arq")?.status).toBe("incomplete");
  });

  it("says it is the minimum that is missing", () => {
    const texts = filled({ minimums: { payoneer_us_withdrawal: "" } });
    expect(readForm(texts).feeGaps.get("payoneer_us_withdrawal")).toBe("minimum");
    expect(route(texts, "arq")?.status).toBe("incomplete");
  });

  it("tells a missing value from a missing minimum", () => {
    const both = filled({
      fees: { ...initialTexts().fees, payoneer_us_withdrawal: "" },
      minimums: { payoneer_us_withdrawal: "x" },
    });
    expect(readForm(both).feeGaps.get("payoneer_us_withdrawal")).toBe("both");
    const value = filled({ fees: { ...initialTexts().fees, payoneer_us_withdrawal: "" } });
    expect(readForm(value).feeGaps.get("payoneer_us_withdrawal")).toBe("value");
  });
});
