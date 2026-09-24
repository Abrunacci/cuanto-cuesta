import { describe, expect, it } from "vitest";

import {
  add,
  CurrencyMismatchError,
  Decimal,
  money,
  roundedDown,
  roundedUp,
  subtract,
} from "./money.ts";

describe("rounding", () => {
  it("rounds credited amounts down to the cent", () => {
    expect(roundedDown(money("957.2815", "USDT")).amount.toFixed(2)).toBe("957.28");
    expect(roundedDown(money("0.019", "USD")).amount.toFixed(2)).toBe("0.01");
  });

  it("rounds fees up to the cent", () => {
    expect(roundedUp(money("5.74278", "USDT")).amount.toFixed(2)).toBe("5.75");
    expect(roundedUp(money("0.001", "ARS")).amount.toFixed(2)).toBe("0.01");
  });

  it("leaves exact cents alone", () => {
    expect(roundedDown(money("10.10", "ARS")).amount.toFixed(2)).toBe("10.10");
    expect(roundedUp(money("10.10", "ARS")).amount.toFixed(2)).toBe("10.10");
  });

  it("divides with 30 decimal places, which lands on the same cent as the Python domain", () => {
    // Python keeps 34 significant digits: 957.2815533980582524271844660194175
    const quotient = new Decimal("986").div("1.03");
    expect(quotient.toString()).toBe("957.281553398058252427184466019417");
    expect(roundedDown(money(quotient, "USDT")).amount.toFixed(2)).toBe("957.28");
  });

  it("does not change the global big.js settings", async () => {
    const { default: Big } = await import("big.js");
    expect(Big.DP).toBe(20);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts in one currency", () => {
    expect(add(money("1.10", "USD"), money("2.20", "USD")).amount.toFixed(2)).toBe("3.30");
    expect(subtract(money("1.10", "USD"), money("2.20", "USD")).amount.toFixed(2)).toBe("-1.10");
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money("1", "USD"), money("1", "ARS"))).toThrow(CurrencyMismatchError);
  });
});
