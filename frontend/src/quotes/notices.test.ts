import { describe, expect, it } from "vitest";

import { parseNumber } from "../text/numbers.ts";
import { cardEstimate, prefillTexts } from "./notices.ts";
import { parseRates } from "./quotes.ts";

const NOW = Date.UTC(2026, 9, 2, 18);

const snapshot = (rates: object[]) => {
  const parsed = parseRates({ server_time: new Date(NOW).toISOString(), rates });
  if (parsed === null) {
    throw new Error("not a snapshot");
  }
  return parsed;
};

const price = (key: string, base: string, quote: string, value: string) => ({
  key,
  base,
  quote,
  price: value,
  source: "test",
  source_url: null,
  observed_at: new Date(NOW).toISOString(),
});

describe("prefillTexts", () => {
  it.each([
    ["mep", "USD", "ARS", "1540", "1.540"],
    ["mep", "USD", "ARS", "1540.50", "1.540,5"],
    ["binance_p2p_usdt_usd", "USDT", "USD", "1.035", "1,035"],
    ["binance_p2p_usdt_usd", "USDT", "USD", "1.03", "1,03"],
  ])(
    "writes %s %s as the person would, and reads back the same",
    (key, base, quote, value, text) => {
      const texts = prefillTexts(snapshot([price(key, base, quote, value)]));
      expect(texts[key]).toBe(text);
      const read = parseNumber(text);
      expect(read.kind === "number" && read.value.eq(value)).toBe(true);
    },
  );

  it("never prefills the card", () => {
    const texts = prefillTexts(
      snapshot([
        { ...price("binance_card_usd_usdt", "USD", "USDT", "0.985"), estimated_final: "0.97" },
      ]),
    );
    expect(texts).toEqual({});
  });
});

describe("cardEstimate", () => {
  it("says nothing of age while the estimate is fresh", () => {
    const estimate = cardEstimate(
      snapshot([
        { ...price("binance_card_usd_usdt", "USD", "USDT", "0.985"), estimated_final: "0.9712" },
      ]),
      NOW,
    );
    expect(estimate?.fieldNote).toBe(
      "Mientras no lo cargues, la comparación usa el estimado: 0,9712 USDT por USD.",
    );
    expect(estimate?.resultNote).toBe(
      "Calculado con el precio estimado de la tarjeta (0,9712 USDT por USD). Cargá el de tu pantalla de pago de Binance para el valor exacto.",
    );
  });

  it("is absent without an estimate", () => {
    expect(
      cardEstimate(
        snapshot([
          { ...price("binance_card_usd_usdt", "USD", "USDT", "0.985"), estimated_final: null },
        ]),
        NOW,
      ),
    ).toBeNull();
  });
});
