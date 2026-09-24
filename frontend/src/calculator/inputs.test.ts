import { describe, expect, it } from "vitest";

import { MAX_AMOUNT, MAX_PRICE_DECIMALS, positiveAmount, positivePrice } from "./inputs.ts";
import { Decimal } from "./money.ts";

describe("positivePrice", () => {
  it("accepts a positive price with up to 8 decimals", () => {
    expect(positivePrice(new Decimal("1596.21")).ok).toBe(true);
    expect(positivePrice(new Decimal("0.00000001")).ok).toBe(true);
    expect(MAX_PRICE_DECIMALS).toBe(8);
  });

  it("rejects zero and negative prices", () => {
    expect(positivePrice(new Decimal("0"))).toEqual({
      ok: false,
      problem: { code: "not_positive" },
    });
    expect(positivePrice(new Decimal("-1"))).toEqual({
      ok: false,
      problem: { code: "not_positive" },
    });
  });

  it("rejects more than 8 decimals", () => {
    expect(positivePrice(new Decimal("1.000000001"))).toEqual({
      ok: false,
      problem: { code: "too_many_decimals", max: 8 },
    });
  });

  it("does not count trailing zeros as decimals", () => {
    expect(positivePrice(new Decimal("1.5000000000")).ok).toBe(true);
  });
});

describe("positiveAmount", () => {
  it("accepts whole cents", () => {
    const result = positiveAmount(new Decimal("1000.50"), "USD");
    expect(result.ok && result.value.amount.toFixed(2)).toBe("1000.50");
  });

  it("rejects zero, negative amounts and fractions of a cent", () => {
    expect(positiveAmount(new Decimal("0"), "USD")).toEqual({
      ok: false,
      problem: { code: "not_positive" },
    });
    expect(positiveAmount(new Decimal("-5"), "USD")).toEqual({
      ok: false,
      problem: { code: "not_positive" },
    });
    expect(positiveAmount(new Decimal("1.001"), "USD")).toEqual({
      ok: false,
      problem: { code: "too_many_decimals", max: 2 },
    });
  });

  it("accepts up to 10 million and rejects more", () => {
    expect(positiveAmount(new Decimal("10000000.00"), "USD").ok).toBe(true);
    expect(positiveAmount(new Decimal("10000000.01"), "USD")).toEqual({
      ok: false,
      problem: { code: "too_large", max: MAX_AMOUNT },
    });
  });
});
