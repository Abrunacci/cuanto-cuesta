import { describe, expect, it } from "vitest";

import { CurrencyMismatchError, money } from "./money.ts";
import { convert, InvalidRateError, rate } from "./rates.ts";

const usdtUsd = rate("p2p", "USDT", "USD", "1.03");

describe("convert", () => {
  it("multiplies from base to quote and rounds down", () => {
    // 957.13 x 1596.21 = 1527787.4... -> down
    expect(
      convert(rate("b", "USDT", "ARS", "1596.21"), money("951.38", "USDT"), "ARS").amount.toFixed(
        2,
      ),
    ).toBe("1518602.26");
  });

  it("divides from quote to base and rounds down", () => {
    // 986.00 / 1.03 = 957.2815... -> 957.28
    expect(convert(usdtUsd, money("986.00", "USD"), "USDT").amount.toFixed(2)).toBe("957.28");
  });

  it("rejects currencies the rate does not quote", () => {
    expect(() => convert(usdtUsd, money("1", "ARS"), "USDT")).toThrow(CurrencyMismatchError);
  });
});

describe("rate", () => {
  it("needs a positive price", () => {
    expect(() => rate("r", "USD", "ARS", "0")).toThrow(InvalidRateError);
    expect(() => rate("r", "USD", "ARS", "-1")).toThrow(InvalidRateError);
  });

  it("needs two different currencies", () => {
    expect(() => rate("r", "USD", "USD", "1")).toThrow(InvalidRateError);
  });
});
