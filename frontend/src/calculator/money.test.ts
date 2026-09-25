import { describe, expect, it } from "vitest";

import {
  add,
  Money,
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

  it("divides with 30 decimal places, which landed on the same cent as the Python domain", () => {
    // Python kept 34 significant digits: 957.2815533980582524271844660194175
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

describe("Money", () => {
  it("cannot be built from a plain object or its constructor", () => {
    // @ts-expect-error: only money() builds a Money
    const plain: Money = { amount: new Decimal("1"), currency: "USD" };
    expect(plain.currency).toBe("USD");
    // @ts-expect-error: the constructor needs a key only money.ts has
    expect(() => new Money(Symbol("Money"), new Decimal("1"), "USD")).toThrow(TypeError);
  });

  it("uses this module's settings even for a Big made elsewhere", async () => {
    const { default: Big } = await import("big.js");
    const Misconfigured = Big();
    Misconfigured.DP = 0;
    Misconfigured.RM = Big.roundUp;
    const { convert, rate } = await import("./rates.ts");
    // 1.00 / 1.03 = 0.9708... -> 0.97; with the other settings it would be 1.00
    const result = convert(
      rate("r", "USDT", "USD", "1.03"),
      money(new Misconfigured("1.00"), "USD"),
      "USDT",
    );
    expect(result.amount.toFixed(2)).toBe("0.97");
  });
});
