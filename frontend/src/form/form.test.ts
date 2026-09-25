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
    expect(problems.get(fieldId.fee("bitso_taker"))).toBe("Como máximo 20 %. Leímos 25,00 %.");
    expect(problems.get(fieldId.fee("arq_ach_deposit"))).toBe("No puede ser negativo.");
    expect(problems.get(fieldId.minimum("payoneer_us_withdrawal"))).toBe(
      "Como máximo 100 USD. Leímos 150,00 USD.",
    );
  });
});

describe("numbers read a thousand times off", () => {
  const priceOf = (texts: FormTexts, key: string) => {
    const reading = readForm(texts);
    const id = fieldId.price(key);
    return {
      problem: reading.problems.get(id),
      warning: reading.warnings.get(id),
      echo: reading.echoes.get(id),
      route: (routeId: string) => reading.comparison.routes.find((r) => r.route.id === routeId),
    };
  };

  it("warns about a P2P price typed with three decimals and a dot, and still computes", () => {
    // Binance shows P2P prices like 1.030; typed that way it reads as one thousand thirty.
    const read = priceOf(filled({ prices: { ...PRICES, p2p_usdt_usd: "1.030" } }), "p2p_usdt_usd");
    expect(read.problem).toBeUndefined();
    expect(read.warning).toBe(
      "Valor inusual: leímos 1.030,00 USD por USDT y lo común está entre 0,5 y 2. Revisalo. " +
        "¿Quisiste poner 1,03?",
    );
    // A jump in the exchange rate must not leave the calculator useless: the route is computed,
    // with the value as typed (1030), not the suggestion. 1000.00 - 4.00 = 996.00 / 1030 = 0.96;
    // - 0.08 = 0.88; - 0.07 = 0.81; 0.6 % -> 0.01; 0.80 x 1596.21 = 1276.968 -> 1276.96
    const binance = read.route("binance_bitso");
    expect(binance?.status === "complete" && binance.result.final.amount.toFixed(2)).toBe(
      "1276.96",
    );
  });

  it("warns about a MEP pasted in English notation, suggesting the fix", () => {
    const read = priceOf(filled({ prices: { ...PRICES, mep: "1,536" } }), "mep");
    expect(read.warning).toBe(
      "Valor inusual: leímos 1,536 ARS por USD y lo común está entre 500 y 50.000. Revisalo. " +
        "¿Quisiste poner 1.536?",
    );
  });

  it("rejects an amount with English thousands instead of reading it as 1 USD", () => {
    expect(readForm(filled({ amount: "1,000" })).problems.get(fieldId.amount)).toBe(
      "Usá como mucho 2 decimales. ¿Quisiste poner 1.000?",
    );
  });

  it("says how a value was read only when both readings are possible", () => {
    // "1.000" as an amount and "1.540" as a MEP have only one plausible reading.
    const plain = readForm(filled({ amount: "1.000", prices: { ...PRICES, mep: "1.540" } }));
    expect(plain.echoes.size).toBe(0);
    // "1.500" for a peso fee may mean 1500 or 1,5: both are valid fees.
    const fee = readForm(
      filled({ fees: { ...initialTexts().fees, bitso_ars_withdrawal: "1.500" } }),
    );
    expect(fee.echoes.get(fieldId.fee("bitso_ars_withdrawal"))).toBe("Leímos 1.500,00 ARS.");
  });

  it.each([
    ["15", "Valor inusual: leímos 15,00 ARS por USD y lo común está entre 500 y 50.000. Revisalo."],
    [
      "154000",
      "Valor inusual: leímos 154.000,00 ARS por USD y lo común está entre 500 y 50.000. Revisalo.",
    ],
    [
      "99,9",
      "Valor inusual: leímos 99,90 ARS por USD y lo común está entre 500 y 50.000. Revisalo.",
    ],
    [
      "153.616",
      "Valor inusual: leímos 153.616,00 ARS por USD y lo común está entre 500 y 50.000. Revisalo.",
    ],
  ])("never suggests a value the person did not type: MEP %s", (text, warning) => {
    expect(priceOf(filled({ prices: { ...PRICES, mep: text } }), "mep").warning).toBe(warning);
  });

  it("still rejects a price above the calculator's absurd cap", () => {
    const read = priceOf(filled({ prices: { ...PRICES, mep: "1.536.160" } }), "mep");
    expect(read.problem).toBe("No puede ser más de 1.000.000.");
    expect(read.route("mep")?.status).toBe("incomplete");
  });

  it("warns without a suggestion when no other reading fits", () => {
    expect(
      priceOf(filled({ prices: { ...PRICES, p2p_usdt_usd: "50" } }), "p2p_usdt_usd").warning,
    ).toBe("Valor inusual: leímos 50,00 USD por USDT y lo común está entre 0,5 y 2. Revisalo.");
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

describe("fees typed with a leading zero or in an ambiguous way", () => {
  const withFee = (id: string, text: string) =>
    readForm(filled({ fees: { ...initialTexts().fees, [id]: text } }));

  it("reads 0.015 % as 0,015 %, not as 15 %", () => {
    // BYMA and broker fees are 0.01 to 0.05 %; typed with a phone's dot they must stay small.
    const reading = withFee("byma_buy", "0.015");
    expect(reading.problems.get(fieldId.fee("byma_buy"))).toBeUndefined();
    const mep = reading.comparison.routes.find((r) => r.route.id === "mep");
    // 1000.00 - 2 % = 980.00; broker 0.49 twice; BYMA 0.015 % = 0.147 -> 0.15, and 0.10
    // 980.00 - 0.98 - 0.25 = 978.77 x 1536.16 = 1503547.3232
    expect(mep?.status === "complete" && mep.result.final.amount.toFixed(2)).toBe("1503547.32");
  });

  it("does not echo a fee whose other reading is above its cap", () => {
    // "1,500" as a USD minimum is 1,5; read as 1500 it would be above the 100 USD cap.
    const reading = readForm(filled({ minimums: { payoneer_us_withdrawal: "1,500" } }));
    expect(reading.echoes.get(fieldId.minimum("payoneer_us_withdrawal"))).toBeUndefined();
  });

  it("says what was read above the cap, and suggests the other reading when it fits", () => {
    expect(withFee("bitso_taker", "1.250").problems.get(fieldId.fee("bitso_taker"))).toBe(
      "Como máximo 20 %. Leímos 1.250,00 %. ¿Quisiste poner 1,25?",
    );
  });

  it("does not echo a negative value back", () => {
    expect(withFee("arq_ach_deposit", "-1").problems.get(fieldId.fee("arq_ach_deposit"))).toBe(
      "No puede ser negativo.",
    );
  });
});
